/**
 * 加盟店が Connect 接続時に**一緒に申請できる**決済手段。
 *
 * 画面（クライアント）とサーバの両方が参照するので、サーバ専用の依存
 * （logger など）を持たないこのファイルに置く。
 *
 * **Ledra 側からは強制しない。** 申請するとその手段の審査に必要な入力が
 * Stripe のオンボーディングに増えるため、選ぶかどうかは加盟店が決める。
 * 選ばなくても、後から Stripe のダッシュボードでいつでも申請できる。
 *
 * Alipay / WeChat Pay はこの API バージョンに対応する capability が無いため
 * ここには入らない（Stripe ダッシュボードの決済手段設定から有効化する）。
 */
export const OPTIONAL_CAPABILITIES = [
  { id: "paypay_payments", label: "PayPay", note: "店頭のQR会計に出せます" },
  { id: "konbini_payments", label: "コンビニ払い", note: "請求書の決済リンク向け" },
  { id: "jp_bank_transfer_payments", label: "銀行振込", note: "請求書の決済リンク向け" },
  { id: "link_payments", label: "Link", note: "Stripe のワンクリック決済" },
] as const;

/** 申請できる capability の ID（リクエストの検証に使う）。 */
export const OPTIONAL_CAPABILITY_IDS: readonly string[] = OPTIONAL_CAPABILITIES.map((c) => c.id);
