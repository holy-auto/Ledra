/**
 * 実証テスト通知ヘルパー。
 *
 * 施工店の notifications テーブルに in-app 通知を作成する。
 * サービスロール（RLS バイパス）で INSERT する。
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

type FtNotificationType =
  | "ft_job_assigned"
  | "ft_evidence_submitted"
  | "ft_inspection_completed"
  | "ft_defect_reported"
  | "ft_recruitment_opened";

interface FtNotifyParams {
  tenantId: string;
  userId?: string | null;
  type: FtNotificationType;
  title: string;
  body: string;
  linkPath: string;
  priority?: "high" | "normal";
}

export async function notifyFtTenant(params: FtNotifyParams): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("notifications").insert({
    tenant_id: params.tenantId,
    user_id: params.userId ?? null,
    notification_type: params.type,
    priority: params.priority ?? "normal",
    title: params.title,
    body: params.body,
    link_path: params.linkPath,
  });

  if (error) {
    console.error("[ftNotify] insert failed:", error.message);
  }
}

interface FtManufacturerNotifyParams {
  manufacturerId: string;
  userId?: string | null;
  type: FtNotificationType;
  title: string;
  body: string;
  linkPath: string;
  priority?: "high" | "normal";
}

/**
 * メーカー向け in-app 通知を作成する（manufacturer_notifications へ service-role INSERT）。
 *
 * notifyFtTenant のメーカー版。宛先が tenant ではなくメーカーになるだけで構造は同じ。
 * 例: 施工店が証拠を提出（evidence_submitted）したら、次に検査するメーカーへ届ける。
 */
export async function notifyFtManufacturer(params: FtManufacturerNotifyParams): Promise<void> {
  const admin = getSupabaseAdmin();

  const { error } = await admin.from("manufacturer_notifications").insert({
    manufacturer_id: params.manufacturerId,
    user_id: params.userId ?? null,
    notification_type: params.type,
    priority: params.priority ?? "normal",
    title: params.title,
    body: params.body,
    link_path: params.linkPath,
  });

  if (error) {
    console.error("[ftNotify] manufacturer insert failed:", error.message);
  }
}
