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
    pageCount: 4,
    downloadUrl: "/api/marketing/resources/service-overview/pdf",
  },
  {
    key: "features-deep-dive",
    title: "機能紹介資料",
    description:
      "証明書発行・車両管理・POS・帳票・分析・連携など、全機能をカテゴリ別に詳説。Admin/Agent/Insurer/Customer の4ポータル構成も収録。",
    pageCount: 10,
    downloadUrl: "/api/marketing/resources/features-deep-dive/pdf",
  },
  {
    key: "security-whitepaper",
    title: "セキュリティホワイトペーパー",
    description:
      "暗号化方式・鍵管理・RLS設計・監査ログ仕様・Polygon anchoring の動作・データライフサイクルを、技術担当者・情報セキュリティ担当者向けにまとめた資料です。",
    badge: "技術者向け",
    pageCount: 10,
    downloadUrl: "/api/marketing/resources/security-whitepaper/pdf",
  },
  {
    key: "case-studies",
    title: "導入事例集",
    description:
      "先行導入いただいているパイロット企業様の導入背景・運用の変化・成果を業種別にまとめた事例集。現時点ではパイロット版として、計測フレームと業界別の変化パターンをまとめています。記事が公開されるたびに PDF にも順次反映します。",
    badge: "随時更新",
    pageCount: 9,
    downloadUrl: "/api/marketing/resources/case-studies/pdf",
  },
  {
    key: "roi-template",
    title: "ROIシミュレーション計算テンプレート",
    description:
      "月間発行数・紙管理に要する時間・書類再発行頻度から、年間の削減効果を算出する記入テンプレート。計算式・代表スケール参考値・感度分析まで収録。",
    pageCount: 7,
    downloadUrl: "/api/marketing/resources/roi-template/pdf",
  },
  {
    key: "pricing-overview",
    title: "料金プラン詳細資料",
    description:
      "各プランに含まれる機能・対応件数・サポート範囲・オプション料金まで、見積提示に必要な情報をまとめた資料です。",
    pageCount: 5,
    downloadUrl: "/api/marketing/resources/pricing-overview/pdf",
  },
] as const;
