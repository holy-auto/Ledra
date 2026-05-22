import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * Sweep expired pending transfers. Called from the daily cron.
 * Returns the number of rows moved to the `expired` state.
 */
export async function expireStalePassportTransfers(): Promise<{ expiredCount: number }> {
  const admin = createServiceRoleAdmin("cron:passport-transfers-expire — sweep pending past expires_at");

  const { data, error } = await admin
    .from("passport_ownership_transfers")
    .update({ status: "expired", responded_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    logger.error("expireStalePassportTransfers update failed", { error: error.message });
    return { expiredCount: 0 };
  }

  return { expiredCount: data?.length ?? 0 };
}
