# Ledra Knowledge Synthesis — June 2026

> Generated: 2026-06-03  
> Scope: Full codebase analysis (263 commits, 240+ API routes, 70+ lib modules, 200+ migrations)  
> Purpose: Actionable patterns, risk signals, and improvement opportunities for the engineering team

---

## Executive Summary

Ledra is a mature, enterprise-grade multi-tenant SaaS platform for vehicle inspection certificates in Japan. The codebase demonstrates sophisticated engineering practices across security, resilience, AI integration, and data integrity. This document synthesizes recurring patterns, identifies high-value improvement opportunities, and extracts institutional knowledge embedded in recent development history.

**Key findings:**
- 8 strong architectural patterns consistently applied — candidates for explicit documentation and onboarding
- 4 high-priority risk signals requiring attention (migration drift, integration surface area, parts integrity backfill, AI confidence calibration)
- 6 performance optimization opportunities with estimated impact
- 3 innovation opportunities aligned with 2026 strategy

---

## Part 1: Established Architectural Patterns

These patterns recur consistently across the codebase and represent proven solutions. New contributors should internalize them early.

### P1 · Tenant Scoping (Universal)

Every database query filters by `tenant_id` (or `insurer_id` for the insurer portal). The ESLint rule enforcing `createTenantScopedAdmin(tenantId)` before service-role access prevents the most catastrophic class of data leakage.

**Where it lives:** `src/lib/supabase/`, ESLint config, all API route handlers  
**Risk if violated:** Cross-tenant data exposure; the #1 security invariant in the codebase

**Pattern:**
```typescript
// ✅ Correct
const admin = createTenantScopedAdmin(tenantId);
const { data } = await admin.from('certificates').select('*');

// ❌ Wrong — bypasses RLS without scoping
const admin = createServiceRoleClient();
```

---

### P2 · Resilience via `withRetry()`

All external service calls (Stripe, Resend, Polygon, QStash, Square) are wrapped with `withRetry()` which provides exponential backoff + jitter + per-key circuit breaking. Supabase pooler is exempt (has built-in retry).

**Where it lives:** `src/lib/http/`  
**CI enforcement:** `npm run audit:retry` — fails if external calls are unwrapped  
**Pattern:** Wrap any call that crosses a network boundary to a third-party service

```typescript
const result = await withRetry(
  () => stripe.invoices.pay(invoiceId),
  { key: 'stripe-invoice-pay', maxAttempts: 3 }
);
```

---

### P3 · Transactional Outbox (Async Tasks)

Long-running operations (batch PDF, Polygon backfill, email campaigns) use QStash as a transactional outbox: the DB record is written first, then the queue message is published. This prevents ghost tasks on DB rollback and enables replay.

**Where it lives:** `src/lib/qstash/`, `/api/qstash/*` route handlers  
**Pattern:** Write DB state → Publish QStash task → Handler reads DB record (not message payload)

---

### P4 · Webhook Idempotence

Stripe and other webhook sources retry on non-2xx. The codebase handles this via:
1. `processed_events` table (deduplication by event ID)
2. Upsert-safe DB operations inside handlers
3. Returning 503 (not 200) on Stripe 23505 conflict — forces Stripe to retry correctly

**Where it lives:** `src/app/api/stripe/`, `src/app/api/webhooks/`

---

### P5 · AI Policy Model (auto / suggest / manual)

The 3-way policy model lets tenants control AI behavior field-by-field:
- `auto` — AI output written directly to form
- `suggest` — AI proposes; user approves
- `manual` — AI disabled for this field

Fields with confidence below threshold auto-downgrade from `auto` → `suggest`. Usage is logged to `ai_usage_logs` with token count, confidence score, latency, and outcome.

**Where it lives:** `src/lib/ai/`, `tenant_ai_automation_settings` table, `/admin/platform/operations`  
**Key insight:** Confidence calibration data in `ai_usage_logs` is underutilized — see Recommendation R3

---

### P6 · Multi-Phase Feature Rollout

Complex features are deployed in numbered phases, each independently shippable. Parts Integrity reached Phase 13 using this pattern. Each phase:
1. Has a dedicated checklist doc (e.g., `parts-integrity-golive-checklist.md`)
2. Ships behind a feature flag or tenant opt-in
3. Adds nullable columns first, backfills, then tightens constraints

**Benefit:** Reduces deployment risk to near-zero for large features; supports incremental customer rollout

---

### P7 · Zero-Downtime Migration Pattern

All migrations follow the same safe sequence:
1. `ADD COLUMN col TYPE NULL` — never blocks reads
2. `UPDATE table SET col = ...` — backfill (batched for large tables)
3. `ALTER COLUMN col SET NOT NULL` — only after full backfill
4. All operations use `IF NOT EXISTS` / `IF EXISTS` for idempotence

**CI enforcement:** `npm run lint:migrations`

---

### P8 · Email Failover Chain

Primary: Resend → Fallback: SendGrid (activated on 5xx, 429, network errors)  
Implemented in `src/lib/email/` with `withRetry()` wrapping both providers.

**Insight:** The failover switch is transparent to callers — all email send calls go through a single facade function.

---

## Part 2: Risk Signals

### R1 · Migration Drift Risk (High Priority)

**Signal:** 200+ SQL migrations with no documented rollback procedures for recent complex migrations (RFC3161 TSA columns, parts integrity backfill tables).

**Risk:** A failed deployment midway through a multi-step migration leaves the schema in an inconsistent state with no clear remediation path.

**Recommendation:** Add `-- ROLLBACK:` annotations to migrations added after migration #150. Create a `docs/migration-rollback-runbook.md` covering the 10 most recent non-trivial migrations.

---

### R2 · Integration Surface Area (Medium Priority)

**Signal:** 14+ live external service integrations. Each is a potential outage source. Current observability focuses on Sentry errors but doesn't surface integration-specific SLA breaches.

**Risk:** Degraded Polygon RPC availability or Resend rate limits can silently slow certificate anchoring or email delivery without triggering alerts.

**Recommendation:** Add per-integration health metrics to the operations dashboard (`/admin/platform/operations`). Track p95 latency and error rate per service key in `ai_usage_logs`-style table or Upstash Redis counters.

---

### R3 · AI Confidence Calibration (Medium Priority)

**Signal:** `ai_usage_logs` captures confidence scores and outcomes (accept/reject/modify) but this data is not fed back to calibrate thresholds. Current thresholds appear statically configured.

**Risk:** Over time, model drift or domain shift causes confidence scores to become miscalibrated. A field auto-writing incorrect data to certificates is a compliance risk.

**Recommendation:** Build a weekly calibration job (`api/cron/`) that reads `ai_usage_logs`, computes per-field accept rates for `auto` policy outputs, and flags fields where user modification rate exceeds 30%. Surface alerts in the operations dashboard.

---

### R4 · Parts Integrity Backfill Completeness (Low-Medium Priority)

**Signal:** Parts Integrity is at Phase 13 — the feature is mature but historical data backfill (RFC3161 timestamps, Polygon anchoring for legacy certificates) may be incomplete.

**Risk:** Customer-facing integrity reports show gaps for certificates issued before the feature launched. Toyota POC materials reference data completeness as a key trust signal.

**Recommendation:** Run a completeness audit query against `parts_installations` joining `certificates` to identify pre-Phase-1 records without TSA timestamps. Document the backfill gap and add a dashboard indicator showing "X% of historical records anchored."

---

## Part 3: Performance Optimization Opportunities

### O1 · AI Translation Cache Hit Rate

`ai_translation_cache` caches multi-language translations with hit counts. The cache likely has cold-start misses for new tenants. A pre-warming job during tenant onboarding could improve perceived performance for the first translated content.

**Estimated impact:** Reduce translation latency from ~800ms (LLM call) to ~5ms (cache hit) for common strings

---

### O2 · Database Index Coverage on High-Traffic Queries

Recent work (commit history) optimized 100+ indexes including FK covering indexes and duplicate cleanup. The pattern of indexing `(tenant_id, created_at)` is correct for time-ordered tenant queries but composite indexes on status fields may be missing for filtered list views.

**Recommendation:** Run `EXPLAIN ANALYZE` on the top 5 admin list views (certificates, documents, reservations) to verify index usage. Pay particular attention to filtered queries like `WHERE status = 'draft' AND tenant_id = $1`.

---

### O3 · API Route Bundle Size

With 240+ API routes across Next.js App Router, cold start times for less-used routes (e.g., `/api/cron/*`, insurer-specific routes) may be elevated. Next.js 16 route segment configs can set `dynamic = 'force-static'` or tune `preferredRegion` for specific routes.

**Recommendation:** Run Lighthouse audit on the admin critical path (dashboard → certificate list → detail) and verify no unexpected client bundle weight from infrequently used modules.

---

### O4 · Realtime Subscription Scope

If Supabase Realtime subscriptions are scoped to entire tables rather than tenant-filtered channels, each connected client receives all change events and filters client-side. This is a scaling bottleneck at high tenant density.

**Recommendation:** Verify Realtime subscriptions use `channel().on('postgres_changes', { filter: 'tenant_id=eq.${tenantId}' })` patterns.

---

### O5 · QStash Message Deduplication Window

For high-throughput events (LINE webhooks triggering AI auto-actions), QStash message deduplication relies on caller-side idempotency keys. If the same LINE message triggers two near-simultaneous webhook deliveries (LINE's at-least-once delivery), duplicate AI processing may occur.

**Recommendation:** Verify `qstash` publish calls include idempotency keys derived from the source event ID.

---

### O6 · Supabase Storage Pre-signed URL Caching

Certificate images fetched for PDF generation likely generate new pre-signed URLs on each request. These URLs are valid for a configured duration (default: 1 hour in Supabase). Caching them in Upstash Redis for their valid duration would reduce storage API calls during batch PDF generation.

---

## Part 4: Success Patterns Worth Documenting

These practices are working well and should be explicitly captured for onboarding.

### S1 · Structured Logging with Secret Masking

`src/lib/logger.ts` auto-masks secrets in log output and attaches `correlationId` to all log lines. This pattern makes production debugging tractable without risking secret exposure in logs.

**Onboarding note:** All new API routes should obtain a `correlationId` from the request (or generate one) and pass it through to the logger.

---

### S2 · Cron Failure Tracking + Cooldown

Cron jobs write failure records to a tracking table and implement cooldown logic to prevent alert storms. This pattern prevents the on-call engineer from being woken repeatedly for a single stuck job.

**Where it lives:** `src/lib/cron/`

---

### S3 · Certificate Photo Requirement Enforcement

The active certificate requires ≥1 photo — enforced at the API level, not just the UI. This prevents a class of data quality issues that would only surface during customer complaints.

**Pattern:** Business rules on data completeness should be enforced at the API boundary, not just validated in the UI.

---

### S4 · TOCTOU Prevention Pattern

Ownership checks are done as part of the same query that performs the write:

```sql
UPDATE certificates 
SET status = 'active'
WHERE id = $1 AND tenant_id = $2  -- ownership check in the WHERE clause
```

This prevents time-of-check/time-of-use race conditions where ownership might change between the check and the action. Documented in `src/app/api/insurer/cases/[id]/route.ts`.

---

## Part 5: Innovation Opportunities

### I1 · AI Confidence Dashboard → Tenant Trust Signal

The data already exists in `ai_usage_logs`. A tenant-facing "AI Accuracy" panel showing "AI suggestions accepted X% of the time this month" would reinforce trust in the platform's AI features and differentiate Ledra from competitors. Low-effort to build on top of existing infrastructure.

---

### I2 · Blockchain Proof Public Verification Page

Ledra anchors certificates to Polygon. Currently, verification requires knowing the transaction hash. A public `/verify/[certificateId]` page that:
1. Retrieves the Polygon transaction hash
2. Shows the anchored hash alongside the certificate content hash
3. Provides a "Verify independently" link to the Polygon explorer

...would transform the anchoring feature from a backend capability into a customer-visible trust differentiator — directly supporting the Toyota POC narrative.

---

### I3 · Predictive Maintenance Reminder Optimization

The 6/12-month follow-up system sends AI-personalized reminders. If `ai_usage_logs` tracked reminder open rates and conversion to booking, the system could learn optimal send timing per customer segment. This would be a first step toward a reinforcement learning feedback loop.

---

## Part 6: Knowledge Gaps

Areas where institutional knowledge appears to be implicit (in code) rather than explicit (in docs).

| Area | Gap | Suggested Doc |
|------|-----|---------------|
| `withRetry()` key naming conventions | No doc on how to name circuit breaker keys | Add to `dx-tooling.md` |
| `createTenantScopedAdmin` usage guide | ESLint catches violations but no positive example guide | Add section to architecture docs |
| QStash handler contract | Handler pattern (read from DB, not message payload) not documented | Add `docs/async-tasks.md` |
| AI auto-action event binding | 12 auto-actions exist but event → handler mapping not in one place | Add event catalog to `ai-automation-guide.md` |
| Cron job inventory | 14 cron routes exist; no single doc listing all jobs, schedules, and failure behaviors | Add `docs/cron-inventory.md` |
| Parts Integrity backfill status | Phase 13 reached but no doc on data completeness for legacy records | Add section to `parts-installation-integrity-design.md` |

---

## Part 7: Recommended Actions (Prioritized)

| Priority | Action | Effort | Impact |
|----------|--------|--------|--------|
| 🔴 High | Add rollback annotations to recent complex migrations | S (2h) | Risk reduction |
| 🔴 High | Add per-integration health metrics to ops dashboard | M (1d) | Observability |
| 🟡 Medium | Build AI confidence calibration weekly cron job | M (1d) | Data quality, compliance |
| 🟡 Medium | Run parts integrity backfill completeness audit | S (2h) | Toyota POC readiness |
| 🟡 Medium | Verify Realtime subscriptions are tenant-filtered | S (1h) | Scale readiness |
| 🟢 Low | Build public `/verify/[certificateId]` page | M (1d) | Customer trust, Toyota POC |
| 🟢 Low | Add AI accuracy panel to tenant dashboard | M (1d) | Product differentiation |
| 🟢 Low | Write `docs/cron-inventory.md` | S (2h) | Onboarding, ops clarity |
| 🟢 Low | Write `docs/async-tasks.md` for QStash pattern | S (1h) | Onboarding |

---

## Appendix: Pattern Index

Quick reference for the patterns documented above.

| ID | Pattern | File/Location |
|----|---------|---------------|
| P1 | Tenant scoping | `src/lib/supabase/`, ESLint config |
| P2 | `withRetry()` resilience | `src/lib/http/` |
| P3 | Transactional outbox | `src/lib/qstash/` |
| P4 | Webhook idempotence | `src/app/api/stripe/`, `api/webhooks/` |
| P5 | AI policy model | `src/lib/ai/`, `tenant_ai_automation_settings` |
| P6 | Multi-phase feature rollout | `docs/parts-installation-integrity-design.md` |
| P7 | Zero-downtime migrations | `supabase/migrations/`, `scripts/lint-migrations.js` |
| P8 | Email failover chain | `src/lib/email/` |
| S1 | Structured logging + secret masking | `src/lib/logger.ts` |
| S2 | Cron failure tracking + cooldown | `src/lib/cron/` |
| S3 | Photo requirement enforcement | Certificate API handlers |
| S4 | TOCTOU prevention | `src/app/api/insurer/cases/[id]/route.ts` |
