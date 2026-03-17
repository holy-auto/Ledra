import { getAdminClient } from "@/lib/api/auth";

export type OverlapResult = {
  overlapping_id: string;
  overlapping_title: string;
  overlapping_start: string;
  overlapping_end: string;
};

/**
 * ダブルブッキングチェック
 * 同一テナント・同一日・時間帯が重複する予約を検出
 *
 * @returns 重複予約の配列。空なら重複なし。
 */
export async function checkOverlap(params: {
  tenantId: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  excludeId?: string;
  assignedUserId?: string;
}): Promise<OverlapResult[]> {
  const admin = getAdminClient();

  const { data, error } = await admin.rpc("check_reservation_overlap", {
    p_tenant_id: params.tenantId,
    p_scheduled_date: params.scheduledDate,
    p_start_time: params.startTime,
    p_end_time: params.endTime,
    p_exclude_id: params.excludeId || null,
    p_assigned_user_id: params.assignedUserId || null,
  });

  if (error) {
    console.error("[overlap check]", error.message);
    return [];
  }

  return (data ?? []) as OverlapResult[];
}
