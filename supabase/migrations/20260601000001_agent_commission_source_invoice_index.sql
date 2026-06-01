-- =============================================================
-- agent_commissions: unique index on source_invoice_id
--
-- Split into its own migration because CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction (Supabase wraps each migration FILE in a tx; a file
-- containing only the CONCURRENTLY statement is run outside one).
-- See docs/operations/zero-downtime-migrations.md rule #1.
--
-- Purpose: one commission per Stripe invoice (ON CONFLICT target for the
-- webhook upsert in src/lib/agents/commission.ts). NULLs stay distinct, so
-- existing/manual rows are unaffected.
--
-- NOTE: this file must contain ONLY the CONCURRENTLY statement. Apply via the
-- normal migration pipeline (supabase db push / CI). If applied ad-hoc, run
-- the statement in autocommit — never inside BEGIN/COMMIT.
-- =============================================================

create unique index concurrently if not exists uq_agent_commissions_source_invoice
  on agent_commissions (source_invoice_id);
