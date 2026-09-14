/**
 * 発注 (job_orders) に紐付いた施工証明を、受発注の双方に見せるときの開示範囲。
 *
 * なぜここに切り出したか:
 *   この一覧は **相手方テナントにも返る**。元請け A が発行した証明書を外注先 B に
 *   見せる（B が施工した記録を B にも残す）のが目的なので、A の顧客 PII —
 *   customer_name / content_free_text / customer_phone_last4 / vehicle_info_json —
 *   がここに混ざると、そのまま他社への個人情報漏洩になる。
 *
 *   certificates の RLS は意図的に据え置き（相手方には行そのものを読ませない）、
 *   開示は許可した列だけに絞ってある。詳細は既に PII を落としてある公開ページ
 *   /c/[public_id] へ送る（getPublicCertificateData が customer_name と
 *   content_free_text を undefined 化する）。
 *
 *   ただし public_id は「5列」で言い切れる開示ではない。これを渡すと相手方は
 *   公開ページを開けるようになり、そこにはナンバー、同じ車両の他の証明書
 *   （それぞれの public_id つき）、その車両の予約タイトルも出る。顧客名・連絡先・
 *   作業メモは落ちているが、**その車両について元請けが持つ施工履歴は見える**。
 *   施工した相手に車両の履歴を見せることは受け入れる（相手は現車を触っている）が、
 *   ここを狭めたくなったら公開ページ側を viewer 別に絞る必要がある
 *   （OPEN_QUESTIONS に記載、今回の範囲外）。
 *
 *   craftsman_name は職人の職業上の名前で顧客 PII ではない（公開証明書にも出る。
 *   20260617000004_certificate_craftsman.sql）。
 *
 * 実際に走る select 文字列は **ルートハンドラ (/api/admin/orders/[id]) の literal が
 * 唯一の実体**。scripts/check-schema.mjs が select の列を同一ファイル内の const から
 * しか解決できないため、そこに置くしかない。ここはその literal を「見せてよい」と
 * 判断した記録で、両者の一致は __tests__ が強制する（＝コピーではなく照合対象）。
 */

/**
 * 相手方テナントへ出してよいと**明示的に判断した**列。
 *
 * ルートの select literal とこのリストの完全一致をテストが強制する。列を1つ足すと
 * 必ず落ちるので、「相手方に見せてよいか」を一度考えないと通らない（fail closed）。
 */
export const ORDER_CERTIFICATE_ALLOWED_COLUMNS = [
  "public_id",
  "status",
  "service_type",
  "craftsman_name",
  "created_at",
] as const;

/**
 * 相手方テナントへ渡してはいけない列の**例**。certificates の PII 列と、顧客・車両の
 * 識別子（他社のマスタを引く足がかりになる）。
 *
 * これは補助的な明示であって番人ではない。`certificates` には
 * `content_preset_json`（スタッフが打ち込んだテンプレート項目がそのまま入る）
 * `maintenance_json` `body_repair_json` `damage_map_json` `quality_fields_json`
 * `meta` `service_price` のように、列挙し切れない量の顧客由来データがある。
 * **番人は許可リスト側**で、そちらは列を足せば必ず落ちる。
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
