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
  siteName: "CARTRUST",
  siteDescription:
    "車の施工証明をデジタルで。施工店と保険会社をつなぐSaaSプラットフォームです。",

  /** マーケティングサイトのベースURL（cartrust.co.jp 移行後に更新） */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://cartrust.co.jp",

  /** アプリ本体のベースURL（app.cartrust.co.jp 移行後に更新） */
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://app.cartrust.co.jp",

  /**
   * ログインリンク先。
   * - 同一ドメイン運用中は "/login" のまま
   * - ドメイン分離後は NEXT_PUBLIC_LOGIN_URL に "https://app.cartrust.co.jp/login" を設定
   */
  loginUrl: process.env.NEXT_PUBLIC_LOGIN_URL ?? "/login",

  /** 問い合わせ先メール */
  contactEmail:
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "info@cartrust.co.jp",
} as const;

/** ヘッダー・フッターで使うナビゲーションリンク */
export const marketingNav = [
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
      { label: "施工店の方へ", href: "/for-shops" },
      { label: "保険会社の方へ", href: "/for-insurers" },
      { label: "料金", href: "/pricing" },
      { label: "FAQ", href: "/faq" },
    ],
  },
  {
    heading: "サポート",
    links: [{ label: "お問い合わせ", href: "/contact" }],
  },
  {
    heading: "法的情報",
    links: [
      { label: "プライバシーポリシー", href: "/privacy" },
      { label: "利用規約", href: "/terms" },
      { label: "特定商取引法に基づく表記", href: "/tokusho" },
    ],
  },
] as const;
