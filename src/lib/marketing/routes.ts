// クライアント（GoogleAnalytics.tsx）からも使うため、next/server や supabase を
// import しないこのファイルに置く。proxy.ts は再エクスポートして使う。

// `src/app/(marketing)` 配下の全トップレベルセグメント（サブページ含む前方一致）。
// proxy.ts の MARKETING_PATHS（認証チェックの要否判定用）とは別目的の別リストで、
// あちらは意図的に一部のマーケティングページしか列挙していないため流用できない
// （例: /blog, /faq, /features 等が漏れて誤って noindex になる）。
// **索引可否そのものの正本は各レイアウトの metadata.robots（src/app/layout.tsx の
// 既定 noindex + (marketing)/layout.tsx の index:true 上書き）。ここは HTML の
// <meta> を見ない経路向けの二重固定であり、この一覧が漏れても index 可否の結論は
// 変わらない（metadata 側は Next.js のレイアウト継承で自動的に正しく決まる）。**
export const MARKETING_ROUTE_SEGMENTS = [
  "/blog",
  "/cases",
  "/contact",
  "/data-disclosure",
  "/demo",
  "/events",
  "/faq",
  "/features",
  "/financial-transparency",
  "/for-agents",
  "/for-btob",
  "/for-insurers",
  "/for-shops",
  "/glossary",
  "/guide",
  "/honest-comparison",
  "/law",
  "/network",
  "/news",
  "/poc",
  "/poc-program",
  "/pricing",
  "/privacy",
  "/resources",
  "/roi",
  "/security",
  "/security-policy",
  "/story",
  "/support",
  "/terms",
  "/tokusho",
  "/verify",
  "/vision",
];

export function isMarketingPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return MARKETING_ROUTE_SEGMENTS.some((seg) => pathname === seg || pathname.startsWith(`${seg}/`));
}
