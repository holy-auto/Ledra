import { createAdminClient } from "@/lib/supabase/admin";

export type CertificateAuditType =
  | "certificate_issued"
  | "certificate_voided"
  | "certificate_viewed"
  | "certificate_pdf_generated"
  | "certificate_pdf_batch"
  | "certificate_public_viewed"
  | "certificate_public_pdf";

export type AuditEventType =
  | CertificateAuditType
  | "vehicle_registered"
  | "vehicle_updated"
  | "member_added"
  | "member_removed"
  | "member_role_changed"
  | "reservation_created"
  | "reservation_completed"
  | "reservation_cancelled"
  | "invoice_created"
  | "invoice_paid"
  | "note";

const TITLE_MAP: Record<string, string> = {
  certificate_issued: "証明書を発行",
  certificate_voided: "証明書を無効化",
  certificate_viewed: "証明書を閲覧",
  certificate_pdf_generated: "PDFを生成",
  certificate_pdf_batch: "PDFを一括生成",
  certificate_public_viewed: "公開ページが閲覧された",
  certificate_public_pdf: "公開PDFが閲覧された",
  vehicle_registered: "車両を登録",
  vehicle_updated: "車両情報を更新",
  member_added: "メンバーを追加",
  member_removed: "メンバーを削除",
  member_role_changed: "ロールを変更",
  reservation_created: "予約を作成",
  reservation_completed: "予約を完了",
  reservation_cancelled: "予約をキャンセル",
  invoice_created: "請求書を作成",
  invoice_paid: "入金を記録",
  note: "メモ",
};

/**
 * 証明書関連の操作を vehicle_histories に記録する。
 * 失敗しても呼び出し元をブロックしない（fire-and-forget）。
 */
export async function logCertificateAction(params: {
  type: CertificateAuditType;
  tenantId: string;
  publicId: string;
  certificateId?: string | null;
  vehicleId?: string | null;
  userId?: string | null;
  description?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const desc = params.description
      ?? [
        `Public ID: ${params.publicId}`,
        params.userId ? `User: ${params.userId}` : null,
        params.ip ? `IP: ${params.ip}` : null,
      ]
        .filter(Boolean)
        .join(" / ");

    await admin.from("vehicle_histories").insert({
      tenant_id: params.tenantId,
      vehicle_id: params.vehicleId ?? null,
      certificate_id: params.certificateId ?? null,
      type: params.type,
      title: TITLE_MAP[params.type] ?? params.type,
      description: desc,
      performed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[audit] logCertificateAction failed:", e);
  }
}

/**
 * 汎用監査ログ記録関数。
 * vehicle_histories テーブルに任意のイベントタイプで記録する。
 */
export async function logAuditEvent(params: {
  type: AuditEventType;
  tenantId: string;
  title?: string;
  description?: string | null;
  vehicleId?: string | null;
  certificateId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("vehicle_histories").insert({
      tenant_id: params.tenantId,
      vehicle_id: params.vehicleId ?? null,
      certificate_id: params.certificateId ?? null,
      type: params.type,
      title: params.title ?? TITLE_MAP[params.type] ?? params.type,
      description: params.description ?? null,
      performed_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[audit] logAuditEvent failed:", e);
  }
}

/** リクエストから IP / User-Agent を取得 */
export function getRequestMeta(req: Request) {
  return {
    ip: req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? null,
    userAgent: req.headers.get("user-agent") ?? null,
  };
}
