/**
 * 外注職人が自分の Ledra から見る「自分が作業した記録」の開示範囲。
 *
 * server-only の tenantLink.ts から切り出してある（あちらはサービスロールを掴むので
 * テストから import できない）。実際に走るクエリは tenantLink.ts 側にあり、
 * この許可リストとの一致は __tests__ がソースを読んで強制する。
 */

/**
 * 外注テナントへ出してよいと**明示的に判断した**証明書の列。
 *
 * **顧客名は Ledra では表示しない**（代表判断 2026-09-03）。外注は施工時に顧客を
 * 知っていることもあるが、これは元請けの顧客名簿を、競合他社でも働きうる会社へ
 * 恒久的に渡す経路になる。ここは「自分が何をやったか」の確認に徹する。
 * 車両や施工内容の詳細は、既に PII を落としてある公開ページ /c/[public_id] へ送る。
 *
 * 列を1つ足すと __tests__ が落ちる（fail closed）。
 */
export const STAFF_PORTFOLIO_CERT_COLUMNS = ["public_id", "service_type", "created_at"] as const;

/** 外注テナントへ渡してはいけない列の例。番人は許可リスト側（完全一致）。 */
export const STAFF_PORTFOLIO_CERT_FORBIDDEN_COLUMNS = [
  "customer_name",
  "customer_email",
  "customer_phone_last4",
  "customer_phone_last4_hash",
  "customer_id",
  "content_free_text",
  "vehicle_info_json",
  "vehicle_vin",
  "remarks",
  "service_price",
] as const;

export type StaffPortfolioCertificate = {
  public_id: string;
  service_type: string | null;
  created_at: string | null;
};
