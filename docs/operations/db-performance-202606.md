# Database performance audit — 2026-06

Source of truth: Supabase performance & security **advisors** + direct
`pg_catalog` inspection of the production project `WEB施工証明書`
(`cahybswpduchptvyvdkk`), read-only. All findings below are reproducible with
`get_advisors` or the queries quoted inline.

Postgres 17. The schema is built from `supabase/migrations/*` and the multi-tenant
RLS model wraps tenant scoping in `tenant_id IN (SELECT my_tenant_ids())`
(`my_tenant_ids()` / `my_tenant_role()` are `STABLE SECURITY DEFINER`), which is
already the InitPlan-friendly pattern — so RLS subquery rewriting is **not** the
headline issue. Missing FK indexes are.

## Advisor summary (performance)

| Lint | Level | Count | Action |
| ---- | ----- | ----: | ------ |
| `0001_unindexed_foreign_keys` | INFO | 146 | **Fixed** → `20260603010000_fk_covering_indexes.sql` |
| `0009_duplicate_index` | WARN | 9 | **8 fixed** → `20260603010001_drop_duplicate_indexes.sql` (1 deferred: `job_orders`) |
| `0003_auth_rls_initplan` | WARN | 100 | Deferred — see below |
| `0006_multiple_permissive_policies` | WARN | 284 | Deferred — see below |
| `0005_unused_index` | INFO | 322 | Deferred (do **not** bulk-drop) — see below |
| `auth_db_connections` | INFO | 1 | Config (pooler), not a migration |

Remediation docs: <https://supabase.com/docs/guides/database/database-linter>

## Fixed in this change

### 1. Unindexed foreign keys (146 → 0)

Every `FOREIGN KEY` whose columns were not the leading prefix of any existing
index. Unindexed FKs (a) force a sequential scan + row lock on the child table
for each parent `DELETE`/`UPDATE` (referential-integrity check), and (b) slow
joins/filters on that column. Migration adds one minimal `(fk_column)` index per
FK with `CREATE INDEX CONCURRENTLY IF NOT EXISTS`.

`tenant_id` FKs already covered by a `(tenant_id, …)` composite index are **not**
re-indexed (already covered).

**Live/repo drift caveat.** The list was generated from the **live** catalog. The
live DB has drifted from the repo migrations (the schema was partly built outside
the migration files), so a few FKs the advisor flags on live are already covered in
a *fresh-from-repo* schema by a differently-named or partial index. For these, the
migration recreates the **repo-canonical** index by its exact name/definition so
that `IF NOT EXISTS` is idempotent — skipped on fresh, created on live — converging
both environments without producing a `0009` duplicate:
`idx_reservations_store_status`, `idx_templates_tenant`, `idx_vh_cert`. One case
(`vehicles.customer_id`) is genuinely uncovered in **both** environments — the
existing `idx_vehicles_customer_id` is `(tenant_id, customer_id)` (customer_id not
leading) — and its name is already taken, so the FK index is created under the
non-colliding name `idx_vehicles_customer_id_fk`.

Detection query (the basis for the migration):

```sql
select cl.relname as table_name, con.conname as fk_name
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
where con.contype='f' and con.connamespace='public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = con.conrelid
      and (string_to_array(i.indkey::text,' ')::int2[])[1:array_length(con.conkey,1)] = con.conkey
  );
```

Trade-off: ~145 new indexes add write overhead, mostly on append-heavy log
tables (`*_audit_logs`, `ai_usage_logs`, `notification_logs`,
`passport_api_call_logs`). Acceptable: the FK relationship already exists, tables
are currently small, and the cascade-delete/lock protection is worth it. Revisit
if write latency on a specific log table regresses.

### 2. Duplicate indexes (8 of 9 dropped)

Pairs with byte-identical definitions (verified via `pg_get_indexdef`). The
redundant copy of each pair is dropped with `DROP INDEX CONCURRENTLY IF EXISTS`.
For each drop, the **kept** side is verified to exist in a *fresh-from-repo* schema
(either an explicit `idx_*` in a migration, or a `*_key` index auto-created by an
inline `UNIQUE`/`PK`); where the drop side is live-only drift, `IF EXISTS` makes it
a no-op on fresh. Notable: `idx_reservations_tenant_scheduled` is misleadingly named
but is actually `(tenant_id, scheduled_date, status)` — identical to
`idx_reservations_tenant_date_status` in both live and repo. See the migration
header for the full keep/drop table.

**`job_orders` deferred (1 of 9).** The advisor flags `idx_job_orders_public_id`
(UNIQUE index) and `job_orders_public_id_key` (UNIQUE constraint) as a duplicate on
live. But `job_orders_public_id_key` is **not** created by any repo migration —
`20260325500000_ensure_job_orders_public_id.sql` only creates the unique *index*.
On a fresh DB, `idx_job_orders_public_id` is therefore the **sole** uniqueness
guard, and dropping it would let duplicate public order IDs through. The pair is
left intact; the live-only constraint-vs-index duplicate should be reconciled in a
dedicated migration (e.g. `ALTER TABLE … DROP CONSTRAINT IF EXISTS
job_orders_public_id_key`, a no-op on fresh) after confirming nothing references
that constraint.

## Deferred (need review — not auto-applied)

These touch the security boundary or are unsafe to act on mechanically.

### `auth_rls_initplan` — 100 policies, 59 tables

Policies that call `auth.<fn>()` / `current_setting()` **directly** (not as
`(select auth.<fn>())`), so the function is re-evaluated per row. These are the
policies still using raw `user_id = auth.uid()` or `auth.role() = 'service_role'`
(e.g. `tenant_memberships_select_v2`, `insurer_users` ×4, `academy_lessons` ×4,
`document_templates` ×4, `customer_intake_invitations` ×4).

Fix is mechanical and behavior-preserving: wrap the call —
`auth.uid()` → `(select auth.uid())`, `auth.role()` → `(select auth.role())`.
Why deferred: ~100 policies, several created via the dynamic `_apply_standard_rls`
helper and scattered across files; each must be recreated **in a single
transaction per table** (a window with no policy exposes data — see
`zero-downtime-migrations.md` soft rules). Worth a dedicated, reviewed PR.
Impact scales with row count; today most affected tables are small.

### `multiple_permissive_policies` — 284, 32 tables

Multiple PERMISSIVE policies for the same (role, action) are OR-ed and **all**
evaluated per row. Heaviest: `vehicles`, `templates`, `nfc_tags`,
`vehicle_histories` (24 each), `certificates`, `job_orders` (18 each). Usually a
public/anon read policy overlapping a tenant policy, counted across roles ×
actions. Consolidating into one policy per (role, action) — or scoping policies
to specific roles with `TO` — changes access semantics, so it needs a careful,
tested PR with the security model in mind. Do not bulk-merge blindly.

### `unused_index` — 322, 148 tables

Indexes with zero scans since stats were last reset. **Do not bulk-drop.** This
project's DB is young (created 2026-02) and many indexes back seasonal/low-
frequency or not-yet-exercised query paths (cron, exports, admin). Several were
just added intentionally for known patterns. Before dropping any: confirm via
`pg_stat_user_indexes.idx_scan` over a representative window (weeks, including
month-end billing/cron), exclude UNIQUE/PK and the FK-covering indexes added
here, and drop with `DROP INDEX CONCURRENTLY` in small batches.

## How these migrations run

`CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY` cannot run inside a
transaction; the Supabase migration runner auto-commits individual statements, so
multiple CONCURRENTLY statements per file are fine (cf.
`20260429000004_perf_indexes_round3.sql`). Both files pass
`npm run lint:migrations`. They were **not** applied to production from here —
they ship through the normal migration pipeline.
