import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * 期限切れの仮押さえ（pending かつ expires_at 経過）を expired にする。日次 cron から呼ぶ。
 * 空き計算・claim は `expires_at > now` で有効判定するため失効は自己修復だが、状態を揃えて
 * UI 表示（失効枠）を正しくする。
 */
export async function expireStaleReservationHolds(): Promise<{ expiredCount: number }> {
  const admin = createServiceRoleAdmin("cron:reservation-holds-expire — sweep pending past expires_at");

  const { data, error } = await admin
    .from("reservation_holds")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    logger.error("expireStaleReservationHolds update failed", { error: error.message });
    return { expiredCount: 0 };
  }

  return { expiredCount: data?.length ?? 0 };
}
