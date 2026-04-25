# N+1 query audit (Phase 8)

## Findings

Searched all `src/app/api` and `src/lib` for the classic N+1 patterns:

```
.map(async (item) => { await db.from(...).eq("id", item.id) })
for (const item of list) { await db.from(...) }
```

…and pulled out two real cases:

### 1. `/api/insurer/watchlist` GET — fixed

**Before**: each watchlist item triggered its own `certificates` or
`vehicles` fetch via `.maybeSingle()` inside `Promise.all + .map(async …)`.
A user with 50 watchlist items issued 50 round-trips.

**After**: collect the certificate / vehicle IDs first, run two batched
`.in("id", ids)` queries, build a `Map<id, row>` and look up locally.

Round-trips: O(items) → O(2) (one per target type, regardless of count).

### 2. `/api/external/nexptg/sync` POST — fixed

**Before**: per-report `vehicle` lookup by VIN inside the report loop.
NexPTG sends 1 sync = N reports, so one round-trip per report just to
resolve the FK.

**After**: collect all VINs from the payload first, fetch in one
`.in("vin_code", vins)` query, build `Map<vin, vehicleId>` and consult
during the loop.

The remaining inserts inside the loop (`thickness_reports.upsert`,
`thickness_measurements.insert`, `thickness_tires.insert`) are
sequential by design — each report's measurements depend on the
report ID returned by the upsert, and combining them into a single
big batch would lose per-report idempotency. Left as-is.

## Patterns we deliberately left alone

### Email / API send loops with per-item DB write

`src/lib/cron/followUp.ts` and `src/lib/gcal/client.ts` send an external
call per row (Resend, Google Calendar) and then write a notification /
event-id row back. That's not an N+1 select; it's a side-effect ledger
where the DB write per iteration is required for idempotency on retry.
Parallelizing would risk hitting upstream rate limits (Resend 10/s,
Google 1000/100s) and would still need per-item completion tracking.

### Booking settings slot upsert

`src/app/api/admin/booking-settings/route.ts` upserts slots in a for-loop
because some have `id` (update) and some don't (insert). UI-bound
cardinality (~30 slots max) makes the round-trip cost negligible.
Refactoring to two batches (insert vs update) would add code without
moving the needle.

### Dashboard summary `count head:true` queries

`src/app/api/admin/dashboard-summary/route.ts` issues many `count` queries
in `Promise.all`. Not N+1 — fixed cardinality, single round-trip group.
Could collapse into one query with `CASE WHEN` aggregations for ~30%
faster, but Postgres counts on filtered indexes are already fast and
the gain doesn't justify the SQL complexity here.

## How to spot N+1 in review

A query is N+1 if you can answer **yes** to all three:

1. There's a list (length unbounded by UI / config).
2. There's an `await db.from(...)` **inside** a `for` / `.map(async ...)` over that list.
3. The query inside the loop filters by a column from the iterated item (`.eq("id", item.id)`).

If yes → rewrite as: collect ids first, one `.in(col, ids)`, build a
`Map<id, row>`, look up during iteration.

If the inner work is an external API call instead of a DB query, look at
parallelism rather than batching: bounded `Promise.all` (e.g. chunks of
10) often beats both serial and full parallel.
