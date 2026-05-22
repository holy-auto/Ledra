/**
 * GET /api/cron/passport-transfers-expire
 *
 * Daily sweep: move any `passport_ownership_transfers` rows past
 * `expires_at` from `pending` → `expired`. Schedule once per day
 * in vercel.json (e.g. 03:15 JST).
 */
import type { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { expireStalePassportTransfers } from "@/lib/passport/transfers/expire";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const auth = verifyCronRequest(req);
    if (!auth.authorized) return apiUnauthorized(auth.error);

    const result = await expireStalePassportTransfers();
    return apiOk({ expired_count: result.expiredCount });
  } catch (e) {
    return apiInternalError(e, "cron/passport-transfers-expire");
  }
}
