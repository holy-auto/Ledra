/**
 * GET /api/cron/passport-billing
 *
 * Monthly Stripe metered-billing rollup for the passport API.
 * Runs on the 1st of every month UTC (vercel.json "0 17 1 * *" =
 * 02:00 JST on the 2nd) and aggregates the *previous* calendar month.
 *
 * Idempotent: re-running on the same day overwrites the Stripe usage
 * record via action='set'. Manual triggers (during ops debugging) won't
 * double-bill.
 */
import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { withCronLock } from "@/lib/cron/lock";
import { previousMonthRangeUtc, runPassportBilling } from "@/lib/passport/billing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { authorized } = verifyCronRequest(req);
  if (!authorized) return apiUnauthorized();

  const url = new URL(req.url);
  // Manual override for backfill / replay. Format: ?period=YYYY-MM
  // (start = first day of that month UTC, end = first day of next month).
  const periodParam = url.searchParams.get("period");
  let start: Date;
  let end: Date;
  if (periodParam) {
    const m = periodParam.match(/^(\d{4})-(\d{2})$/);
    if (!m) {
      return apiJson({ ok: false, error: "invalid_period_format" }, { status: 400 });
    }
    const year = Number(m[1]);
    const month = Number(m[2]); // 1-12
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 1));
  } else {
    const range = previousMonthRangeUtc(new Date());
    start = range.start;
    end = range.end;
  }

  const admin = createServiceRoleAdmin("passport-billing cron — monthly Stripe usage rollup");

  const lockResult = await withCronLock(admin, "passport-billing", 3600, async () => {
    const result = await runPassportBilling({ admin, start, end });
    return apiJson({ ok: true, ...result });
  }).catch((e) => apiInternalError(e, "passport-billing cron"));

  if ("acquired" in lockResult && !lockResult.acquired) {
    return apiJson({ ok: true, skipped: "lock-held" });
  }
  if ("value" in lockResult) {
    return lockResult.value as ReturnType<typeof apiJson>;
  }
  return lockResult;
}
