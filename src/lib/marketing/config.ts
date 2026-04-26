/**
 * マーケティングサイト設定
 *
 * ドメイン差し替えはここだけを変更 or 環境変数で上書き。
 * - 開発中: デフォルト値がそのまま使われる
 * - 本番移行後: NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL を設定
 *
 * metadata / canonical / OGP / CTA リンクはすべてここから参照すること。
 */

export const siteConfig = {
  siteName: "Ledra",
  siteDescription: "車の施工証明をデジタルで。施工店と保険会社をつなぐSaaSプラットフォームです。",

  /** マーケティングサイトのベースURL（ledra.co.jp 移行後に更新） */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://ledra.co.jp",

  /** アプリ本体のベースURL（app.ledra.co.jp 移行後に更新） */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ledra.co.jp",

  /**
   * ログインリンク先。
   * - 同一ドメイン運用中は "/login" のまま
   * - ドメイン分離後は NEXT_PUBLIC_LOGIN_URL に "https://app.ledra.co.jp/login" を設定
   */
  loginUrl: process.env.NEXT_PUBLIC_LOGIN_URL ?? "/login",

  /** 問い合わせ先メール */
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@ledra.co.jp",
} as const;

/** ヘッダー・フッターで使うナビゲーションリンク */
export const marketingNav = [
  { label: "機能", href: "/features" },
  { label: "施工店の方へ", href: "/for-shops" },
  { label: "保険会社の方へ", href: "/for-insurers" },
  { label: "料金", href: "/pricing" },
  { label: "FAQ", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
] as const;

/** フッター用リンクグループ */
export const footerNavGroups = [
  {
    heading: "サービス",
    links: [
      { label: "機能一覧", href: "/features" },
      { label: "施工店の方へ", href: "/for-shops" },
      { label: "BtoB発注をしたい企業の方へ", href: "/for-btob" },
      { label: "代理店の方へ", href: "/for-agents" },
      { label: "保険会社の方へ", href: "/for-insurers" },
      { label: "料金", href: "/pricing" },
    ],
  },
  {
    heading: "リソース",
    links: [
      { label: "資料ダウンロード", href: "/resources" },
      { label: "ROIシミュレーター", href: "/roi" },
      { label: "事例", href: "/cases" },
      { label: "お知らせ", href: "/news" },
      { label: "ブログ", href: "/blog" },
      { label: "イベント", href: "/events" },
    ],
  },
  {
    heading: "サポート",
    links: [
      { label: "導入支援・サポート", href: "/support" },
      { label: "セキュリティ", href: "/security" },
      { label: "FAQ", href: "/faq" },
      { label: "お問い合わせ", href: "/contact" },
    ],
  },
  {
    heading: "法的情報",
    links: [
      { label: "プライバシーポリシー", href: "/privacy" },
      { label: "利用規約", href: "/terms" },
      { label: "特定商取引法に基づく表記", href: "/law" },
    ],
  },
] as const;
