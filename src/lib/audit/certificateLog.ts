import { createTenantScopedAdmin } from "@/lib/supabase/admin";

export type CertificateAuditType =
  | "certificate_issued"
  | "certificate_edited"
  | "certificate_voided"
  | "certificate_viewed"
  | "certificate_pdf_generated"
  | "certificate_pdf_batch"
  | "certificate_public_viewed"
  | "certificate_public_pdf";

/**
 * **閲覧・出力の監査**。この5種別の行は、`description` を省略して書かれると
 * 下の `logCertificateAction` が `Public ID: … / User: <uid> / IP: <IP>` を組み立てる。
 * つまり**訪問者の IP と社内の uid が本文に入る**。
 *
 * `vehicle_histories` は車両の履歴と監査ログが同居しているので、**車両履歴を
 * 顧客・第三者に見せる経路は、必ずこの5種別を落とすこと。** 落とし忘れると漏れる。
 *
 * - 公開証明書ページ `/c/[public_id]`（PR #1040 で対応）
 * - 顧客ポータル `/api/customer/list` と `/api/customer/data-export`（本 PR）
 *
 * 「誰かが見た」は車両の出来事ではないので、そもそも履歴として見せる意味がない。
 * **description の書式ではなく型で落とす。** 既定の組み立てが変わっても、
 * 監査種別が増えても漏れない（増えたらこの配列に足す）。
 */
export const PRIVATE_AUDIT_TYPES = [
  "certificate_viewed",
  "certificate_pdf_generated",
  "certificate_pdf_batch",
  "certificate_public_viewed",
  "certificate_public_pdf",
] as const satisfies readonly CertificateAuditType[];

/** PostgREST の `.or()` に渡す除外条件。`type IS NULL` の旧行は残す。 */
export const EXCLUDE_PRIVATE_AUDIT_FILTER = `type.is.null,type.not.in.(${PRIVATE_AUDIT_TYPES.join(",")})`;

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
  | "ai_settings_changed"
  | "ai_suggestion_generated"
  | "ai_suggestion_applied"
  | "ai_suggestion_rejected"
  | "note";

const TITLE_MAP: Record<string, string> = {
  certificate_issued: "証明書を発行",
  certificate_edited: "証明書を編集",
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
  ai_settings_changed: "AI 自動入力の設定を変更",
  ai_suggestion_generated: "AI 提案を生成",
  ai_suggestion_applied: "AI 提案を反映",
  ai_suggestion_rejected: "AI 提案を却下",
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
    const { admin } = createTenantScopedAdmin(params.tenantId);
    const desc =
      params.description ??
      [
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
    const { admin } = createTenantScopedAdmin(params.tenantId);
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
