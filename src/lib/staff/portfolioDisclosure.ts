/**
 * 職人の実績リンク (/w/[token]) の開示範囲。
 *
 * server-only の portfolioLink.ts から切り出してある（あちらはサービスロールを掴むので
 * テストから import できない）。実際に走るクエリは portfolioLink.ts 側にあり、
 * この許可リストとの一致は __tests__ がソースを読んで強制する。
 */

/**
 * 職人ページに出してよいと**明示的に判断した**証明書の列。
 *
 * このページは顧客 PII を出さない。職人が施工時に顧客を知っていたとしても、リンクは
 * 退職後も手元に残りうるため、恒久的な顧客名簿にはしない（失効は運用に依存する）。
 * 車両や施工内容の詳細は、既に PII を落としてある公開ページ /c/[public_id] へ送る。
 *
 * 列を1つ足すと __tests__ が落ちる（fail closed）。
 */
export const STAFF_PORTFOLIO_CERT_COLUMNS = ["public_id", "service_type", "created_at"] as const;

/** 職人ページへ渡してはいけない列の例。番人は許可リスト側（完全一致）。 */
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
