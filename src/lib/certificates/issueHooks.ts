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
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { completeDraftPartInstallationsForReservation } from "@/lib/parts/installationService";
import { sendCustomerLineText } from "@/lib/line/client";
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
  /** この証明書のもとになった予約。部品交換の下書き完成・LINE通知の起点に使う。 */
  reservationId?: string | null;
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

  // 証明書レコード（メタデータ）のアンカー queue。写真ゼロの証明書でも発行日・施工内容の
  // 存在証明をオンチェーンに残すための追記 (docs/anchoring-roadmap.md)。
  // CERT_RECORD_ANCHOR_ENABLED=false (既定) なら no-op。発行は決して止めない。
  enqueueCertificateAnchor({ tenantId: params.tenantId, certificateId: params.certificateId }).catch((e) =>
    logger.warn("[cert-issued] cert-anchor enqueue failed", { err: e instanceof Error ? e.message : String(e) }),
  );

  // 発行直後フォローアップ (send_on_issue 有効テナントのみ)
  await triggerPostIssueFollowUp(params).catch((e) =>
    logger.warn("[cert-issued] post_issue follow-up failed", { err: e instanceof Error ? e.message : String(e) }),
  );

  // 部品交換トグルで作った下書き (draft) を完成 (installed) にする。証明書発行の必須チェック
  // (施工後写真) が既にこの時点で満たされているため、新たな撮影要求はしない。
  if (params.reservationId) {
    completeDraftPartInstallationsForReservation(params.tenantId, params.reservationId).catch((e) =>
      logger.warn("[cert-issued] complete draft part installations failed", {
        err: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  // 証明書発行を顧客へ LINE で自動連絡 (line_user_id が無ければ何もしない)。進捗通知と同様
  // fire-and-forget・失敗しても発行はブロックしない。
  notifyCustomerCertificateIssuedViaLine(params).catch((e) =>
    logger.warn("[cert-issued] LINE notify failed", { err: e instanceof Error ? e.message : String(e) }),
  );
}

/** 証明書発行を顧客へ LINE で連絡する (customers.line_user_id がある場合のみ)。 */
async function notifyCustomerCertificateIssuedViaLine(params: CertificateIssuedParams): Promise<void> {
  if (!params.customerId) return;

  const { admin } = createTenantScopedAdmin(params.tenantId);
  const { data: customer } = await admin
    .from("customers")
    .select("id, line_user_id")
    .eq("id", params.customerId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (!customer?.line_user_id) return;

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/c/${params.publicId}`;
  const body = `【証明書発行】施工証明書を発行しました。${params.customerName ? `${params.customerName} 様\n` : ""}以下のリンクからご確認いただけます。\n${portalUrl}`;

  await sendCustomerLineText({
    tenantId: params.tenantId,
    customerId: params.customerId,
    lineUserId: customer.line_user_id as string,
    body,
  });
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
