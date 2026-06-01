-- =============================================================
-- Agent commission flow — close the referral → commission → payout loop
--
-- Adds the missing wiring for the 紹介代理店 (referral agent) portal:
--   1) idempotency key so each Stripe subscription invoice generates at
--      most one commission (event-driven generation in the webhook).
--   2) atomic click counter + updated_at for agent_referral_links so the
--      /ref/<code> landing route can attribute referrals.
-- All DDL is idempotent (safe to re-run). Indexes use CONCURRENTLY (the
-- Supabase migration runner auto-commits individual statements, so this is
-- not wrapped in a transaction).
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 1) agent_commissions: source invoice idempotency
-- ─────────────────────────────────────────────────────────────
alter table agent_commissions
  add column if not exists source_invoice_id text;

-- One commission per Stripe invoice. NULLs stay distinct (manual rows are
-- unaffected), so this can be a plain unique index usable as an ON CONFLICT
-- target for the webhook upsert.
create unique index concurrently if not exists uq_agent_commissions_source_invoice
  on agent_commissions (source_invoice_id);

-- ─────────────────────────────────────────────────────────────
-- 2) agent_referral_links: updated_at + atomic click increment
--    (the existing /api/agent/referral-links route already selects
--     updated_at; add it nullable to avoid a table rewrite / 3-step.)
-- ─────────────────────────────────────────────────────────────
alter table agent_referral_links
  add column if not exists updated_at timestamptz default now();

-- Atomic, race-free click counter for the public /ref/<code> landing.
create or replace function increment_referral_link_click(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update agent_referral_links
     set click_count = coalesce(click_count, 0) + 1,
         updated_at  = now()
   where code = p_code
     and is_active = true;
$$;

-- Only the server-side service role (the /ref route runs un-authenticated
-- with the service-role client) needs to call this.
revoke all on function increment_referral_link_click(text) from public;
grant execute on function increment_referral_link_click(text) to service_role;
