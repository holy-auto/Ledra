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

/**
 * 監査種別ごとに「**車両の出来事として、テナント外（顧客・第三者）に見せてよいか**」。
 *
 * ## なぜ許可リストなのか（除外リストから反転した）
 *
 * 最初は「見せない5種別」を並べる除外リストだった。これは**既定が公開**なので、
 * 種別が増えるたびに漏れる。実際に3つの形で破れている。
 *
 * 1. `AuditEventType` は24種別あり、除外していたのは5種別だけだった。
 *    `member_added` の本文には**メールアドレス**が、`ai_settings_changed` には
 *    **uid を含む JSON** がそのまま入る（本番で実在）。
 * 2. `logAuditEvent({ type: "note", vehicleId })` はパスポート移転で
 *    `移転先: <メールアドレス>` を書く。呼び出し4箇所すべてが `vehicleId` を渡すので、
 *    移転を1回使った時点で公開ページに出る（本番の移転はまだ0件＝未発火）。
 * 3. `aiAuditLog.ts` は `type: event.action` と**動的に**書くので、
 *    `ai_auto_action_executed` のように**この union に無い種別**が DB に入る。
 *    除外リストは、知らない種別を原理的に覆えない。
 *
 * 許可リストなら、1〜3のどれも既定で落ちる。**知らないものを見せない。**
 *
 * `Record<AuditEventType, boolean>` にしているので、union に種別を足すと
 * **ここが型エラーになる**。分類を書くまでコンパイルが通らない。
 */
const OUTWARD_VISIBLE: Record<AuditEventType, boolean> = {
  // 車両に起きたこと。顧客・第三者に見せる意味がある。
  certificate_issued: true,
  certificate_edited: true,
  certificate_voided: true,

  // 閲覧・出力の監査。`logCertificateAction` の既定 description が
  // `Public ID: … / User: <uid> / IP: <IP>` を組み立てる（下を参照）。
  // 「誰かが見た」はそもそも車両の出来事ではない。
  certificate_viewed: false,
  certificate_pdf_generated: false,
  certificate_pdf_batch: false,
  certificate_public_viewed: false,
  certificate_public_pdf: false,

  // テナント内部の記録。車両の出来事ではなく、本文に個人情報が入る。
  vehicle_registered: false,
  vehicle_updated: false,
  member_added: false,
  member_removed: false,
  member_role_changed: false,
  reservation_created: false,
  reservation_completed: false,
  reservation_cancelled: false,
  invoice_created: false,
  invoice_paid: false,
  ai_settings_changed: false,
  ai_suggestion_generated: false,
  ai_suggestion_applied: false,
  ai_suggestion_rejected: false,
  // 自由記述。何が入るか書き手次第なので、公開しない。
  note: false,
};

/**
 * テナント外へ出してよい種別。
 *
 * `vehicle_histories` は**車両の履歴と監査ログが同居**しているので、
 * 車両履歴を顧客・第三者に見せる経路は、必ずこの許可リストで絞ること。
 *
 * - 公開証明書ページ `/c/[public_id]`（未認証）
 * - 顧客ポータル `/api/customer/list` と `/api/customer/data-export`
 *
 * 読む側は `.in("type", OUTWARD_VISIBLE_TYPES)` で使う。旧実装は
 * `.or("type.is.null,type.not.in.(…)")` と書いて `type` が NULL の旧行を
 * 残す作りにしていたが、**`vehicle_histories.type` は `not null`** なので
 * （`20260313020000_core_tables.sql`、本番も同じ）その分岐は起こりえない。
 */
export const OUTWARD_VISIBLE_TYPES = (Object.keys(OUTWARD_VISIBLE) as AuditEventType[]).filter(
  (t) => OUTWARD_VISIBLE[t],
);

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
