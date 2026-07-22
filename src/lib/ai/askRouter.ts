/**
 * 「Ledraに聞く」の入口ルーティング（純関数、LLM 不使用）。
 *
 * スタッフの自由入力を、まず決まった画面への案内で解決できないか試す。
 * ここでマッチすれば AI 呼び出しなしで即答できる（コスト・プラン制限ゼロ）。
 * マッチしなければ呼び出し側が qaAssistant.generateQAAnswer にフォールバックする。
 */

export interface AskRouteMatch {
  href: string;
  label: string;
}

const ROUTES: { keywords: string[]; href: string; label: string }[] = [
  { keywords: ["承認"], href: "/admin/inbox", label: "承認インボックス" },
  { keywords: ["証明書", "しょうめいしょ"], href: "/admin/certificates", label: "証明書一覧" },
  { keywords: ["請求書", "せいきゅう", "invoice"], href: "/admin/invoices", label: "請求書" },
  { keywords: ["課金", "プラン", "billing"], href: "/admin/billing", label: "請求・プラン" },
  { keywords: ["顧客", "こきゃく", "customer"], href: "/admin/customers", label: "顧客管理" },
  // 飛び込み案件は「予約」を含む言い回し（例:「予約なしで飛び込み案件」）をされやすいため、
  // 汎用的な予約キーワードより先に判定する。
  { keywords: ["案件", "飛び込み"], href: "/admin/jobs/new", label: "飛び込み案件" },
  { keywords: ["予約", "よやく", "booking"], href: "/admin/reservations", label: "予約" },
  { keywords: ["在庫", "発注", "inventory"], href: "/admin/inventory", label: "在庫・発注" },
];

export function matchAskRoute(question: string): AskRouteMatch | null {
  const q = question.trim().toLowerCase();
  if (!q) return null;
  for (const route of ROUTES) {
    if (route.keywords.some((k) => q.includes(k.toLowerCase()))) {
      return { href: route.href, label: route.label };
    }
  }
  return null;
}
