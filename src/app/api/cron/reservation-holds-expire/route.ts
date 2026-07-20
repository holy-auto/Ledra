/**
 * GET /api/cron/reservation-holds-expire
 *
 * 期限切れの仮押さえ（reservation_holds: pending かつ expires_at 経過）を expired にする。
 * 空き計算・claim は expires_at > now で有効判定するため失効は自己修復だが、状態を揃える。
 * vercel.json で毎時起動。
 */
import type { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { verifyCronRequest } from "@/lib/cronAuth";
import { expireStaleReservationHolds } from "@/lib/booking/holdExpire";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    const auth = verifyCronRequest(req);
    if (!auth.authorized) return apiUnauthorized(auth.error);

    const result = await expireStaleReservationHolds();
    return apiOk({ expired_count: result.expiredCount });
  } catch (e) {
    return apiInternalError(e, "cron/reservation-holds-expire");
  }
}
