# Zero-downtime migration policy

**TL;DR**: Postgres takes ACCESS EXCLUSIVE locks for many DDL statements. On a
busy multi-tenant table that means every read and write blocks until the
statement finishes. The rules below avoid those locks. `npm run lint:migrations`
enforces them on new migration files.

## Hard rules

| # | Rule | Why |
| - | ---- | --- |
| 1 | `CREATE INDEX` must use `CONCURRENTLY`, in its own migration file. | A regular `CREATE INDEX` blocks writes on the table for the duration of the build. `CONCURRENTLY` cannot run inside a transaction, so it has to be its own file (Supabase wraps each file in a tx). |
| 2 | `DROP INDEX` must use `CONCURRENTLY`. | Same reason. |
| 3 | `ADD COLUMN ... NOT NULL` must include `DEFAULT` (a constant or `now()`-style function). | Without a default Postgres rejects existing rows; with a non-volatile default Postgres ≥ 11 only updates the catalog, no rewrite. |
| 4 | `ALTER COLUMN ... TYPE` is forbidden as a single statement on a populated table. | Rewrites the entire table under ACCESS EXCLUSIVE. Use expand/contract: add new column → backfill in batches → switch readers → drop old. |
| 5 | `RENAME COLUMN` / `RENAME TABLE` is forbidden in the same deploy that ships the new name. | Old code is still running and will 500 the moment the rename commits. Use the same expand/contract pattern. |
| 6 | `ADD CONSTRAINT ... FOREIGN KEY` must use `NOT VALID`, with `VALIDATE CONSTRAINT` in a follow-up migration. | `NOT VALID` only takes a brief lock; validation reads the table without blocking writes. |
| 7 | `ADD CONSTRAINT ... CHECK` must use `NOT VALID`, validated separately. | Same. |

## Soft rules (reviewer judgement)

- **Backfills**: avoid single `UPDATE ... WHERE` against tables > ~100k rows. Loop in batches of 1–10k by primary key, with `pg_sleep(0.05)` between batches if there's contention.
- **RLS policy changes**: drop and recreate policies in a single transaction. A window where no policy exists exposes data.
- **Trigger changes**: prefer `CREATE OR REPLACE FUNCTION` over `DROP FUNCTION ... CASCADE`. CASCADE silently drops triggers that depend on the function.
- **Storage buckets**: `storage.objects` policies are part of the migration surface. Lint rules above apply to them too.

## Workflow for a risky change

1. **Expand** — add the new column / index / constraint in a non-blocking way.
2. **Backfill** — write data into the new shape in batches; no breaking reads yet.
3. **Switch** — deploy app code that reads/writes the new shape.
4. **Contract** — drop the old shape once nothing reads it (a separate migration, days later, after monitoring).

Each step is its own migration. Don't combine them.

## Emergency exception

If you genuinely need to break a rule (data corruption hotfix, etc.), add the
filename to `supabase/migrations.allowlist` with a comment explaining why,
schedule a maintenance window, and link to a postmortem. The allowlist is
not the place to silence warnings on routine work.

## What about the existing 138 migrations?

They predate this policy and have already executed on every environment, so
they're locked in `migrations.allowlist`. The lint only fires on files added
after the policy landed. Don't try to "fix" old migrations — re-running them
desyncs schemas and accomplishes nothing.

## Running the lint locally

```bash
npm run lint:migrations
```

CI runs the same check on every PR.
