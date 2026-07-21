import type { SupabaseClient } from "@supabase/supabase-js";

export type ClaimResult = "ok" | "full" | "no_slot";

/**
 * 原子的な枠の仮押さえ。DB 関数 `claim_reservation_hold`（advisory lock + 占有カウント）を呼ぶ。
 * ok なら holdId を返す。full=満席 / no_slot=その時間帯に受付枠が無い。
 */
export async function claimReservationHold(
  admin: SupabaseClient,
  params: {
    targetTenantId: string;
    heldByTenantId: string;
    scheduledDate: string; // YYYY-MM-DD
    startTime: string; // HH:MM(:SS)
    endTime: string;
    jobOrderId: string | null;
    ttlMinutes?: number;
  },
): Promise<{ result: ClaimResult; holdId: string | null }> {
  const { data, error } = await admin.rpc("claim_reservation_hold", {
    p_target_tenant: params.targetTenantId,
    p_held_by_tenant: params.heldByTenantId,
    p_scheduled_date: params.scheduledDate,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_job_order_id: params.jobOrderId,
    p_ttl_minutes: params.ttlMinutes ?? 2880,
  });
  if (error) throw error;

  // RETURNS TABLE(hold_id uuid, result text) → 1 行の配列で返る。
  const row = Array.isArray(data) ? data[0] : data;
  const result = (row?.result ?? "no_slot") as ClaimResult;
  return { result, holdId: (row?.hold_id as string | null) ?? null };
}
