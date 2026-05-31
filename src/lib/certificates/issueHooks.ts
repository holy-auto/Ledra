/**
 * 証明書「発行 (= active 化)」時に走る副作用フック。
 *
 * 写真添付必須ルール (`photoRequirement.ts`) の導入により、証明書は
 *   作成 (draft) → 写真アップロード → 活性化 (draft→active)
 * の順で発行されるようになった。これに伴い、従来 `createCertAction`
 * (作成時) で発火していた「保険案件の enqueue」「発行直後フォローアップ」を
 * 活性化のチョークポイント (status / activate ルート) へ移設する。
 *
 * 二重発火を避けるため、呼び出し側は **draft→active の初回発行時のみ**
 * 本フックを呼ぶこと (void→active の再発行では呼ばない)。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { enqueueInsuranceCaseCreated } from "@/lib/qstash/publish";
import { logger } from "@/lib/logger";

export interface CertificateIssuedParams {
  tenantId: string;
  publicId: string;
  certificateId: string;
  customerName: string;
  customerId?: string | null;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  serviceType?: string | null;
  createdBy?: string | null;
}

/**
 * 証明書が active になった瞬間に呼ぶ。非同期処理は fire-and-forget で、
 * 失敗しても発行 (status 更新) 自体は止めない。
 */
export async function triggerCertificateIssued(params: CertificateIssuedParams): Promise<void> {
  // 保険会社連携: 案件作成キューへ enqueue (QStash 側で public_id 単位の dedup)
  enqueueInsuranceCaseCreated({
    certificate_id: params.publicId, // handler 側で public_id 解決
    public_id: params.publicId,
    tenant_id: params.tenantId,
    customer_name: params.customerName,
    vehicle_model: params.vehicleModel ?? "",
    vehicle_plate: params.vehiclePlate ?? "",
    service_type: params.serviceType ?? "",
    created_by: params.createdBy ?? null,
  }).catch((e) =>
    logger.warn("[cert-issued] QStash enqueue failed", { err: e instanceof Error ? e.message : String(e) }),
  );

  // 発行直後フォローアップ (send_on_issue 有効テナントのみ)
  await triggerPostIssueFollowUp(params).catch((e) =>
    logger.warn("[cert-issued] post_issue follow-up failed", { err: e instanceof Error ? e.message : String(e) }),
  );
}

/** 発行直後フォローアップ通知ログを (重複なく) 記録する。 */
async function triggerPostIssueFollowUp(params: CertificateIssuedParams): Promise<void> {
  if (!params.customerId) return;

  const { admin } = createTenantScopedAdmin(params.tenantId);

  // send_on_issue 設定確認
  const { data: setting } = await admin
    .from("follow_up_settings")
    .select("send_on_issue, enabled")
    .eq("tenant_id", params.tenantId)
    .eq("enabled", true)
    .single();

  if (!setting?.send_on_issue) return;

  // 重複チェック: 同じ証明書の post_issue が既にあれば何もしない
  const { data: existing } = await admin
    .from("notification_logs")
    .select("id")
    .eq("target_id", params.certificateId)
    .eq("type", "post_issue")
    .limit(1);

  if (existing?.length) return;

  // post_issue 通知ログを queued で記録 (実送信は cron)
  await admin.from("notification_logs").insert({
    tenant_id: params.tenantId,
    type: "post_issue",
    target_type: "certificate",
    target_id: params.certificateId,
    status: "queued",
  });
}
