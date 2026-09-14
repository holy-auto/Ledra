/**
 * Shared catalog of the auto-generated marketing resource PDFs.
 *
 * Single source of truth for the human-facing title / description / download
 * link of each entry in `RESOURCE_PDFS` (src/lib/marketing/resourcePdf.tsx).
 *
 * These PDFs are rendered server-side from live source-of-truth data
 * (PLANS, FEATURE_GROUPS, SECURITY_BLOCKS, ...) at request time, so they are
 * always current: adding or removing a product feature updates them
 * automatically — no re-upload required.
 *
 * Kept as PURE DATA (no `@react-pdf/renderer` / JSZip imports) so it can be
 * consumed by both the public resources page (server component) and the agent
 * portal materials page (client component) without pulling the PDF renderer
 * into the client bundle. The `key` of every entry must exist in
 * `RESOURCE_PDFS`; the catalog↔registry parity test guards against drift.
 */

export type Resource = {
  /** Stable key; must match a `RESOURCE_PDFS` entry. Used as `resource_key` on leads. */
  key: string;
  title: string;
  description: string;
  badge?: string;
  /** Direct download URL (the generated-PDF API route). */
  downloadUrl?: string;
  /** Filename for the saved download. Defaults to `${key}.pdf`. Set for non-PDF (ZIP). */
  downloadFilename?: string;
  /**
   * カード上の「約Nページ」表示。実物とズレないよう
   * `__tests__/resourcePdf.render.test.tsx` が実際にレンダリングして突き合わせる。
   * 内容が増えてページが増えたらテストが落ちるので、そこで更新する。
   */
  pageCount?: number;
  ctaLabel?: string;
};

/**
 * The product-content resources that render from live data. Order is the
 * display order on the public resources page.
 */
export const RESOURCE_CATALOG: readonly Resource[] = [
  {
    key: "service-overview",
    title: "サービス概要資料",
    description:
      "Ledra がどんな課題を解くサービスか、4ポータル設計、初期導入の流れをコンパクトにまとめた基本資料です。最初の1本としてお勧めします。",
    badge: "最初にお勧め",
    // この資料だけページ数を宣言しない。画面キャプチャ（public/screenshots/）が
    // 揃っているかで 11〜14 ページの間で変わるため、固定値は必ず嘘になる。
    // ―― 総数を宣言できるのは、中身が実行環境に依存しない資料だけ。
    downloadUrl: "/api/marketing/resources/service-overview/pdf",
  },
  {
    key: "features-deep-dive",
    title: "機能紹介資料",
    description:
      "証明書発行・車両管理・POS・帳票・分析・連携など、全機能をカテゴリ別に詳説。Admin/Agent/Insurer/Customer の4ポータル構成も収録。",
    pageCount: 18,
    downloadUrl: "/api/marketing/resources/features-deep-dive/pdf",
  },
  {
    key: "security-whitepaper",
    title: "セキュリティホワイトペーパー",
    description:
      "暗号化方式・鍵管理・RLS設計・監査ログ仕様・Polygon anchoring の動作・データライフサイクルを、技術担当者・情報セキュリティ担当者向けにまとめた資料です。",
    badge: "技術者向け",
    pageCount: 19,
    downloadUrl: "/api/marketing/resources/security-whitepaper/pdf",
  },
  {
    key: "case-studies",
    title: "導入事例集",
    description:
      "先行導入いただいているパイロット企業様の導入背景・運用の変化・成果を業種別にまとめた事例集。現時点ではパイロット版として、計測フレームと業界別の変化パターンをまとめています。記事が公開されるたびに PDF にも順次反映します。",
    badge: "随時更新",
    pageCount: 16,
    downloadUrl: "/api/marketing/resources/case-studies/pdf",
  },
  {
    key: "roi-template",
    title: "ROIシミュレーション計算テンプレート",
    description:
      "月間発行数・紙管理に要する時間・書類再発行頻度から、年間の削減効果を算出する記入テンプレート。計算式・代表スケール参考値・感度分析まで収録。",
    pageCount: 13,
    downloadUrl: "/api/marketing/resources/roi-template/pdf",
  },
  {
    key: "pricing-overview",
    title: "料金プラン詳細資料",
    description:
      "各プランに含まれる機能・対応件数・サポート範囲・オプション料金まで、見積提示に必要な情報をまとめた資料です。",
    pageCount: 13,
    downloadUrl: "/api/marketing/resources/pricing-overview/pdf",
  },
  {
    key: "operation-guide",
    title: "運用スタートガイド",
    description:
      "証明書発行・予約・POS会計といった日常業務から、店舗設定・スタッフ招待・2要素認証まで、管理画面の操作手順を画面の流れどおりにまとめた手順書。導入研修の配布資料としてそのままお使いいただけます。",
    badge: "導入時に",
    pageCount: 16,
    downloadUrl: "/api/marketing/resources/operation-guide/pdf",
  },
  {
    key: "glossary",
    title: "自動車施工・記録の用語集",
    description:
      "コーティング・板金・保険査定・デジタル証明の用語を、事実ベースの定義でまとめた用語集。新人研修の副読本、保険会社・代理店との認識合わせにどうぞ。",
    pageCount: 7,
    downloadUrl: "/api/marketing/resources/glossary/pdf",
  },
] as const;
