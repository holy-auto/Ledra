/**
 * 連携カタログ — 「連携」ページ 1 枚に出す全連携先の定義（client-safe / IO なし）。
 *
 * これまで連携の入口は店舗設定・会計ページ・予約ページ・請求ページに散っていて、
 * 加盟店は「どこまで繋がっているか」を 1 画面で確認できなかった。ここを唯一の
 * 出典にして、状態の突き合わせだけをページ側で行う。
 *
 * loginOnly = 加盟店側の発行作業（開発者コンソールでの ID / トークン発行）が
 * 不要で、自社アカウントにログインするだけで繋がるか。false のものが
 * 「まだ手間が残っている連携」であり、潰していく対象。
 */

export type IntegrationConnectKind =
  /** 汎用 OAuth エンジン (/api/admin/connect/{id}) に載っている */
  | "oauth"
  /** 個別実装の OAuth ルートを持つ既存連携 */
  | "legacy"
  /** 画面内フォームに値を入れて繋ぐ */
  | "manual";

export interface IntegrationCatalogEntry {
  id: string;
  label: string;
  summary: string;
  /** 連携ページ内の見出し */
  section: "通知・コミュニケーション" | "会計・決済" | "予約・カレンダー" | "POS・計測機器";
  kind: IntegrationConnectKind;
  loginOnly: boolean;
  /** 設定の実体があるページ（このページ内で完結するものは undefined） */
  href?: string;
}

export const INTEGRATION_CATALOG: readonly IntegrationCatalogEntry[] = [
  {
    id: "slack",
    label: "Slack",
    summary: "新しい予約が入ったときに、選んだチャンネルへ自動投稿します。",
    section: "通知・コミュニケーション",
    kind: "oauth",
    loginOnly: true,
  },
  {
    id: "line",
    label: "LINE公式アカウント",
    summary: "予約確認・リマインダー・書類送付をLINEで自動送信します。",
    section: "通知・コミュニケーション",
    kind: "manual",
    // LINE Messaging API はチャネルごとの発行が必要。モジュールチャネル移行で
    // ログインのみに出来る可能性がある（docs/line-module-channel-research.md）。
    loginOnly: false,
  },
  {
    id: "email_inbound",
    label: "メール予約取り込み",
    summary: "予約メールを専用アドレスへ転送すると、AIが内容を読み取り予約化します。",
    section: "予約・カレンダー",
    kind: "manual",
    loginOnly: true,
  },
  {
    id: "gcal",
    label: "Googleカレンダー",
    summary: "Ledraの予約とGoogleカレンダーを双方向で同期します。",
    section: "予約・カレンダー",
    kind: "legacy",
    loginOnly: true,
    href: "/admin/reservations",
  },
  {
    id: "freee",
    label: "freee会計",
    summary: "請求・POS・決済の売上をfreeeへ自動で仕訳します。",
    section: "会計・決済",
    kind: "legacy",
    loginOnly: true,
    href: "/admin/accounting",
  },
  {
    id: "moneyforward",
    label: "マネーフォワード クラウド",
    summary: "請求・POS・決済の売上をマネーフォワードへ自動で仕訳します。",
    section: "会計・決済",
    kind: "legacy",
    loginOnly: true,
    href: "/admin/accounting",
  },
  {
    id: "stripe",
    label: "Stripe（オンライン決済）",
    summary: "請求書からのカード決済を受け付けます。",
    section: "会計・決済",
    kind: "legacy",
    loginOnly: true,
    href: "/admin/settings",
  },
  {
    id: "square",
    label: "Square（POS）",
    summary: "SquareのPOS売上データをLedraに取り込みます。",
    section: "POS・計測機器",
    kind: "legacy",
    loginOnly: true,
  },
  {
    id: "nexptg",
    label: "NexPTG（膜厚計）",
    summary: "NexPTGアプリで測定した膜厚データをLedraへ自動同期します。",
    section: "POS・計測機器",
    // Ledra 側が発行したキーを相手アプリに入れる方向なので、OAuth 化の対象外。
    kind: "manual",
    loginOnly: false,
  },
] as const;

export const CATALOG_SECTIONS = [
  "通知・コミュニケーション",
  "予約・カレンダー",
  "会計・決済",
  "POS・計測機器",
] as const satisfies readonly IntegrationCatalogEntry["section"][];
