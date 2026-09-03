/**
 * Quick Create アクション定義（IMP-020）。
 *
 * v2.0 §4: 任意の画面からコンテキスト継承付きで新規レコードを作成できる。
 *
 * Quick Create はどの画面からでもアクセス可能な新規作成メニュー。
 * 現在のルートからコンテキスト（顧客 ID / 車両 ID 等）を推論し、
 * 該当する作成画面へ pre-fill パラメータ付きで遷移する。
 *
 * ponytail: 最小構成。アクション定義 + ルートからのコンテキスト推論のみ。
 * UI コンポーネントは CommandPalette に統合（別 FAB を作らない）。
 */

import type { Permission } from "@/lib/auth/permissions";

// ── Quick Create アクション ──

export type QuickCreateAction = {
  id: string;
  label: string;
  /** 基本の遷移先 */
  href: string;
  /** 必要な権限（:create が最適。なければ :edit で代用） */
  permission: Permission;
  /** CommandPalette 内のセクション名 */
  section: string;
};

/**
 * Quick Create アクション一覧。
 *
 * ponytail: permission 値は既存の permissions.ts 定義に合わせる。
 * 各エンティティの :create 権限をゲートに使う。
 */
export const QUICK_CREATE_ACTIONS: readonly QuickCreateAction[] = [
  {
    // ponytail: reservations/customers に /new ページは無い。一覧ページの
    // ?create=1 でモーダルを自動オープンする既存の規約に合わせる
    // （CustomersModeSwitch と同じ規約。ReservationsClient にも今回配線した）。
    id: "reservation",
    label: "新規予約",
    href: "/admin/reservations?create=1",
    permission: "reservations:create",
    section: "新規作成",
  },
  {
    id: "customer",
    label: "新規顧客",
    href: "/admin/customers?create=1",
    permission: "customers:create",
    section: "新規作成",
  },
  {
    id: "vehicle",
    label: "新規車両",
    href: "/admin/vehicles/new",
    permission: "vehicles:create",
    section: "新規作成",
  },
  {
    id: "certificate",
    label: "新規証明書",
    href: "/admin/certificates/new",
    permission: "certificates:create",
    section: "新規作成",
  },
  {
    id: "invoice",
    label: "新規請求書",
    href: "/admin/invoices/new",
    permission: "invoices:create",
    section: "新規作成",
  },
];

// ── コンテキスト継承 ──

/**
 * 現在のルートから Quick Create コンテキストを推論する。
 *
 * 例: /admin/customers/abc-123 → { customerId: "abc-123" }
 * 例: /admin/vehicles/xyz-456 → { vehicleId: "xyz-456" }
 * 例: /admin/jobs/def-789 → { jobId: "def-789" }
 *
 * 返したコンテキストは遷移先 URL のクエリパラメータに変換し、
 * 新規作成画面側で pre-fill に使う。
 */
export type CreateContext = {
  customerId?: string;
  vehicleId?: string;
  jobId?: string;
};

// `new` は作成画面自体のパス（例: /admin/vehicles/new）であって ID ではない。
// 除外しないと「新規作成画面を開いた状態で Quick Create を開く」と
// vehicleId="new" のような存在しない ID がコンテキストに紛れ込む。
const CONTEXT_PATTERNS: { pattern: RegExp; extract: (m: RegExpMatchArray) => CreateContext }[] = [
  { pattern: /^\/admin\/customers\/(?!new$)([^/]+)$/, extract: (m) => ({ customerId: m[1] }) },
  { pattern: /^\/admin\/vehicles\/(?!new$)([^/]+)$/, extract: (m) => ({ vehicleId: m[1] }) },
  { pattern: /^\/admin\/jobs\/(?!new$)([^/]+)$/, extract: (m) => ({ jobId: m[1] }) },
];

/** 現在のパスからコンテキストを抽出する。 */
export function inferCreateContext(pathname: string): CreateContext {
  for (const { pattern, extract } of CONTEXT_PATTERNS) {
    const m = pathname.match(pattern);
    if (m) return extract(m);
  }
  return {};
}

/**
 * Quick Create の遷移先 URL にコンテキストをクエリパラメータとして付与する。
 *
 * 例: "/admin/certificates/new" + { customerId: "abc" }
 *   → "/admin/certificates/new?customerId=abc"
 *
 * href 側が既にクエリを持つ場合（例: "/admin/reservations?create=1"）も
 * `&` で正しく連結する（`?` を2つ生成しない）。
 */
export function applyCreateContext(href: string, ctx: CreateContext): string {
  const params = new URLSearchParams();
  if (ctx.customerId) params.set("customerId", ctx.customerId);
  if (ctx.vehicleId) params.set("vehicleId", ctx.vehicleId);
  if (ctx.jobId) params.set("jobId", ctx.jobId);
  const qs = params.toString();
  if (!qs) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${qs}`;
}
