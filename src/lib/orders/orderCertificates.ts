/**
 * 発注 (job_orders) に紐付いた施工証明を、受発注の双方に見せるための取得列。
 *
 * なぜ列を固定して切り出したか:
 *   この一覧は **相手方テナントにも返る**。元請け A が発行した証明書を外注先 B に
 *   見せる（B が施工した記録を B にも残す）のが目的なので、A の顧客 PII —
 *   customer_name / content_free_text / customer_phone_last4 / vehicle_info_json —
 *   がここに混ざると、そのまま他社への個人情報漏洩になる。
 *
 *   certificates の RLS は意図的に据え置き（相手方には行そのものを読ませない）、
 *   開示はこの列だけに絞ってある。詳細は既に PII を落としてある公開ページ
 *   /c/[public_id] へ送る（getPublicCertificateData が customer_name と
 *   content_free_text を undefined 化する）。
 *
 *   craftsman_name は職人の職業上の名前で顧客 PII ではない（公開証明書にも出る。
 *   20260617000004_certificate_craftsman.sql）。
 *
 * ルートハンドラ側 (/api/admin/orders/[id]) は同じ文字列を literal で持つ
 * （scripts/check-schema.mjs が select の列を同一ファイル内の const からしか
 * 解決できないため）。両者の一致とここの禁止列は __tests__ が番人になる。
 */
export const ORDER_CERTIFICATE_SELECT = "public_id, status, service_type, craftsman_name, created_at";

export const ORDER_CERTIFICATE_COLUMNS = ORDER_CERTIFICATE_SELECT.split(", ");

/**
 * 相手方テナントへ渡してはいけない列。certificates の PII 列と、顧客・車両の
 * 識別子（他社のマスタを引く足がかりになる）。
 */
export const ORDER_CERTIFICATE_FORBIDDEN_COLUMNS = [
  "customer_name",
  "customer_email",
  "customer_phone_last4",
  "customer_phone_last4_hash",
  "customer_id",
  "content_free_text",
  "vehicle_id",
  "vehicle_info_json",
  "vehicle_vin",
  "remarks",
  "tenant_id",
] as const;

export type OrderCertificate = {
  public_id: string;
  status: string | null;
  service_type: string | null;
  craftsman_name: string | null;
  created_at: string | null;
};
