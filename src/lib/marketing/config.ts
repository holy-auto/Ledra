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
  /** 日本語読み。AI検索・音声検索で「レドラ」表記にも当たるよう構造化データに載せる。 */
  siteNameAlt: "レドラ",
  /** タイトルの主キーワード。title は `${siteName}｜${siteTagline}` で組み立てる。 */
  siteTagline: "自動車整備・コーティング店の施工履歴プラットフォーム",
  siteDescription:
    "Ledra（レドラ）は、自動車整備・鈑金塗装・コーティング・PPF施工店向けの施工履歴プラットフォーム。" +
    "予約・作業管理から、施工・整備履歴の記録、改ざん検知付きの施工証明書発行、請求・帳票、顧客管理、保険会社との案件連携までをAIで一本化します。",

  /**
   * SEO / AI検索(GEO)向けキーワード。Google はほぼ無視するが、LLM クローラーや
   * 一部の検索エンジンは meta keywords / JSON-LD の keywords を参照する。
   * カテゴリ語（施工履歴プラットフォーム＝PR TIMES と表記を統一）＋ 買い手が実際に
   * 検索する語（整備工場 管理システム 等）＋ 実際の業務領域（整備・鈑金・コーティング・
   * PPF・予約・顧客管理・保険連携）を網羅する。
   */
  keywords: [
    "施工履歴プラットフォーム",
    "施工履歴 管理",
    "整備履歴 管理",
    "整備記録簿 電子化",
    "自動車整備 SaaS",
    "整備工場 管理システム",
    "整備工場 DX",
    "鈑金塗装 業務管理",
    "コーティング店 顧客管理",
    "PPF 施工管理",
    "カーケア SaaS",
    "自動車 業務効率化",
    "予約管理 整備工場",
    "施工証明書 発行",
    "改ざん検知 証明書",
    "AI 業務自動化 自動車",
    "保険会社 案件連携",
    "Ledra",
    "レドラ",
  ] as string[],

  /**
   * 主要機能。JSON-LD の featureList に載せ、AI検索が「Ledra は何ができるか」を
   * 事実ベースで拾えるようにする。
   * 方針: 公開マーケLPが既に宣伝している機能のみを載せる。LP未掲載の機能
   * （例: 部品装着インテグリティ）は、社内資料にはあっても構造化データで先出し
   * しない（公開範囲は事業側の判断。露出したくなったらここに追記する）。
   */
  featureList: [
    "予約・作業スケジュール管理",
    "施工証明書の発行（施工前後の写真ゲート付き）",
    "ブロックチェーン・アンカリング＋RFC3161タイムスタンプによる改ざん検知",
    "請求書・帳票の作成・一括送付",
    "顧客管理（顧客360・車両ごとの施工履歴）",
    "保険会社（損保）との案件連携",
    "AI業務自動化（写真改ざん検知・不正スコア・証明書下書き生成）",
    "LINE連携（予約・見積り・オプション提案・証明書通知）",
    "電子署名・QRによる公開検証",
  ] as string[],

  /** マーケティングサイトのベースURL。canonical は www に統一。NEXT_PUBLIC_SITE_URL で上書き可。 */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ledra.co.jp",

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
      { label: "大手企業との PoC", href: "/poc-program" },
      { label: "料金", href: "/pricing" },
      { label: "正直な比較（向いていない方）", href: "/honest-comparison" },
    ],
  },
  {
    heading: "リソース",
    links: [
      { label: "創業ストーリー", href: "/story" },
      { label: "未来予想図", href: "/vision" },
      { label: "透明性ダッシュボード", href: "/financial-transparency" },
      { label: "資料ダウンロード", href: "/resources" },
      { label: "ROIシミュレーター", href: "/roi" },
      { label: "事例", href: "/cases" },
      { label: "ネットワークの広がり", href: "/network" },
      { label: "お知らせ", href: "/news" },
      { label: "ブログ", href: "/blog" },
      { label: "用語集", href: "/glossary" },
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
      { label: "情報セキュリティ基本方針", href: "/security-policy" },
      { label: "特定商取引法に基づく表記", href: "/law" },
    ],
  },
] as const;
