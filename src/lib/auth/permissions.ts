import type { Role } from "./roles";

/**
 * Centralized permission system for Ledra.
 * Each permission maps to a specific action in the app.
 */
export type Permission =
  // Dashboard
  | "dashboard:view"
  // Certificates
  | "certificates:view"
  | "certificates:create"
  | "certificates:edit"
  | "certificates:void"
  // Vehicles (service vehicles)
  | "vehicles:view"
  | "vehicles:create"
  | "vehicles:edit"
  | "vehicles:delete"
  // Customers
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  | "customers:delete"
  // Reservations
  | "reservations:view"
  | "reservations:create"
  | "reservations:edit"
  // Invoices
  | "invoices:view"
  | "invoices:create"
  | "invoices:edit"
  // Market (BtoB)
  | "market:view"
  | "market:create"
  | "market:edit"
  | "market:delete"
  // Orders
  | "orders:view"
  | "orders:create"
  // Templates & Menu Items
  | "templates:manage"
  | "menu_items:manage"
  // Members
  | "members:view"
  | "members:manage"
  // Settings
  | "settings:view"
  | "settings:edit"
  // Billing
  | "billing:view"
  | "billing:manage"
  // Stores
  | "stores:view"
  | "stores:manage"
  // Payments
  | "payments:view"
  | "payments:create"
  | "payments:manage"
  // Template Options
  | "template_options:view"
  | "template_options:manage"
  // Registers
  | "registers:view"
  | "registers:manage"
  | "register_sessions:view"
  | "register_sessions:operate"
  | "register_sessions:manage"
  // Shop
  | "shop:view"
  // Other
  | "announcements:view"
  | "news:view"
  // サイトコンテンツ（Ledra 公開サイトのブログ/ニュース/イベント）は
  // プラットフォーム運営のもの。加盟店の資産ではない。
  // 20260424010000_site_content_posts_super_admin_only.sql:
  //   「加盟店（owner/admin/staff/viewer）はDB直接操作でも変更不可」
  | "site_content:view"
  | "site_content:manage"
  | "price_stats:view"
  | "management:view"
  | "audit:view"
  | "insurers:view"
  | "insurers:manage"
  | "logo:manage"
  // Platform (super_admin only)
  | "platform:manage"
  | "platform:operations";

/**
 * Permission matrix by role.
 * super_admin gets everything including platform management.
 * owner gets everything within their tenant.
 */
const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [
    "dashboard:view",
    "certificates:view",
    "certificates:create",
    "certificates:edit",
    "certificates:void",
    "vehicles:view",
    "vehicles:create",
    "vehicles:edit",
    "vehicles:delete",
    "customers:view",
    "customers:create",
    "customers:edit",
    "customers:delete",
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
    "market:delete",
    "orders:view",
    "orders:create",
    "templates:manage",
    "menu_items:manage",
    "members:view",
    "members:manage",
    "settings:view",
    "settings:edit",
    "billing:view",
    "billing:manage",
    "stores:view",
    "stores:manage",
    "registers:view",
    "registers:manage",
    "register_sessions:view",
    "register_sessions:operate",
    "register_sessions:manage",
    "announcements:view",
    "news:view",
    "site_content:view",
    "site_content:manage",
    "price_stats:view",
    "management:view",
    "audit:view",
    "insurers:view",
    "insurers:manage",
    "payments:view",
    "payments:create",
    "payments:manage",
    "logo:manage",
    "template_options:view",
    "template_options:manage",
    "shop:view",
    "platform:manage",
    "platform:operations",
  ],
  owner: [
    "dashboard:view",
    "certificates:view",
    "certificates:create",
    "certificates:edit",
    "certificates:void",
    "vehicles:view",
    "vehicles:create",
    "vehicles:edit",
    "vehicles:delete",
    "customers:view",
    "customers:create",
    "customers:edit",
    "customers:delete",
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
    "market:delete",
    "orders:view",
    "orders:create",
    "templates:manage",
    "menu_items:manage",
    "members:view",
    "members:manage",
    "settings:view",
    "settings:edit",
    "billing:view",
    "billing:manage",
    "stores:view",
    "stores:manage",
    "registers:view",
    "registers:manage",
    "register_sessions:view",
    "register_sessions:operate",
    "register_sessions:manage",
    "announcements:view",
    "news:view",
    "price_stats:view",
    "management:view",
    "audit:view",
    "insurers:view",
    "insurers:manage",
    "payments:view",
    "payments:create",
    "payments:manage",
    "logo:manage",
    "template_options:view",
    "template_options:manage",
    "shop:view",
  ],
  admin: [
    "dashboard:view",
    "certificates:view",
    "certificates:create",
    "certificates:edit",
    "certificates:void",
    "vehicles:view",
    "vehicles:create",
    "vehicles:edit",
    "vehicles:delete",
    "customers:view",
    "customers:create",
    "customers:edit",
    "customers:delete",
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
    "market:delete",
    "orders:view",
    "orders:create",
    "templates:manage",
    "menu_items:manage",
    "members:view",
    "members:manage",
    "settings:view",
    "settings:edit",
    "billing:view",
    "stores:view",
    "stores:manage",
    "registers:view",
    "registers:manage",
    "register_sessions:view",
    "register_sessions:operate",
    "register_sessions:manage",
    "announcements:view",
    "news:view",
    "price_stats:view",
    "management:view",
    "audit:view",
    "insurers:view",
    "insurers:manage",
    "payments:view",
    "payments:create",
    "payments:manage",
    "logo:manage",
    "template_options:view",
    "template_options:manage",
    "shop:view",
  ],
  staff: [
    "dashboard:view",
    "certificates:view",
    "certificates:create",
    "certificates:edit",
    "vehicles:view",
    "vehicles:create",
    "vehicles:edit",
    "customers:view",
    "customers:create",
    "customers:edit",
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "market:view",
    "market:create",
    "market:edit",
    "orders:view",
    "orders:create",
    "stores:view",
    "registers:view",
    "register_sessions:view",
    "register_sessions:operate",
    "payments:view",
    "payments:create",
    "announcements:view",
    "news:view",
    "price_stats:view",
    "template_options:view",
    "shop:view",
  ],
  viewer: [
    "dashboard:view",
    "certificates:view",
    "vehicles:view",
    "customers:view",
    "reservations:view",
    "invoices:view",
    "market:view",
    "orders:view",
    "stores:view",
    "registers:view",
    "register_sessions:view",
    "payments:view",
    "announcements:view",
    "news:view",
    "price_stats:view",
    "template_options:view",
    "shop:view",
  ],
};

const _permissionSets = new Map<Role, Set<Permission>>();
function getPermSet(role: Role): Set<Permission> {
  let s = _permissionSets.get(role);
  if (!s) {
    s = new Set(ROLE_PERMISSIONS[role]);
    _permissionSets.set(role, s);
  }
  return s;
}

/** Check if a role has a specific permission */
export function hasPermission(role: Role, permission: Permission): boolean {
  return getPermSet(role).has(permission);
}

/** Get all permissions for a role */
export function getPermissions(role: Role): ReadonlySet<Permission> {
  return getPermSet(role);
}

/**
 * Map sidebar routes to required permissions.
 * Used by Sidebar and AdminRouteGuard.
 *
 * **これはクライアント側の表示制御であって、セキュリティ境界ではない。**
 * AdminRouteGuard はブラウザで動くため、API を直接叩けば素通りする。
 * サーバ側の強制は各 route.ts の requirePermission() が担い、
 * どのルートがどの Permission を要求すべきかは API_ROUTE_PERMISSIONS に登録する。
 */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  "/admin": "dashboard:view",
  "/admin/certificates": "certificates:view",
  "/admin/vehicles": "vehicles:view",
  "/admin/customers": "customers:view",
  "/admin/line-broadcasts": "customers:view",
  "/admin/reservations": "reservations:view",
  "/admin/body-repair": "reservations:view",
  "/admin/loaner-cars": "reservations:view",
  "/admin/parts-install": "reservations:edit",
  "/admin/tire-storage": "vehicles:view",
  "/admin/invoices": "invoices:view",
  "/admin/management": "management:view",
  "/admin/staff": "members:view",
  "/admin/booths": "reservations:view",
  "/admin/menu-items": "menu_items:manage",
  "/admin/service-packages": "menu_items:manage",
  "/admin/inventory": "menu_items:manage",
  "/admin/stocktake": "menu_items:manage",
  "/admin/payment-ledger": "invoices:view",
  "/admin/templates": "templates:manage",
  "/admin/members": "members:view",
  "/admin/btob": "market:view",
  "/admin/market-vehicles": "market:view",
  "/admin/orders": "orders:view",
  "/admin/price-stats": "price_stats:view",
  "/admin/announcements": "announcements:view",
  "/admin/news": "news:view",
  "/admin/site-content": "site_content:view",
  "/admin/inquiries": "market:view",
  "/admin/insurers": "insurers:view",
  "/admin/insurers/tenant-access": "insurers:manage",
  "/admin/settings": "settings:view",
  "/admin/billing": "billing:view",
  "/admin/logo": "logo:manage",
  "/admin/audit": "audit:view",
  "/admin/stores": "stores:view",
  "/admin/organizations": "stores:manage",
  "/admin/hq-overview": "stores:manage",
  "/admin/integrations": "settings:view",
  "/admin/pos": "register_sessions:operate",
  "/admin/registers": "registers:view",
  "/admin/deals": "market:view",
  "/admin/payments": "payments:view",
  "/admin/square": "payments:view",
  "/admin/shop": "shop:view",
  "/admin/template-options": "template_options:view",
  "/admin/platform/template-orders": "template_options:manage",
  "/admin/platform/operations": "platform:operations",
};

/**
 * Determine the required permission for a given pathname.
 * Returns null if no permission check needed.
 */
export function requiredPermissionForPath(pathname: string): Permission | null {
  // Exact match first
  if (ROUTE_PERMISSIONS[pathname]) return ROUTE_PERMISSIONS[pathname];

  // Prefix match (e.g. /admin/certificates/new -> certificates:view)
  for (const [route, perm] of Object.entries(ROUTE_PERMISSIONS)) {
    if (route !== "/admin" && pathname.startsWith(route)) return perm;
  }

  // Write operations by path
  if (pathname.includes("/new") || pathname.includes("/create")) {
    if (pathname.startsWith("/admin/certificates")) return "certificates:create";
    if (pathname.startsWith("/admin/market-vehicles")) return "market:create";
  }

  return null;
}

/**
 * API ルート → その **変更系メソッド（POST/PUT/PATCH/DELETE）すべて**が要求する Permission。
 *
 * ROUTE_PERMISSIONS が画面を守るのに対し、こちらは実際の権限境界である API を守る。
 * キーは `src/app/api` からの相対ディレクトリ（`route.ts` を除いたもの）。
 * メソッドごとに要求が違うルートは、メソッド名をキーにしたオブジェクトで書く
 * （例: payments は POST=create / PUT・DELETE=manage）。配列にして「いずれか1つ」に
 * すると、DELETE を弱い方へ下げても検査が通ってしまう。
 *
 * `{ minRole: "staff" }` は「特定の権限ではなくロール下限で守る」ルート用。
 * AI 呼び出しのように、対応する Permission が語彙に無く「閲覧専用を弾ければよい」
 * ものに使う（代表判断 2026-09-01）。
 *
 * 構造テスト（`__tests__/apiRoutePermissions.test.ts`）が、登録した各ルートの
 * **変更系ハンドラ1つ1つ**について `requirePermission(...)` / `hasPermission(...)` の
 * 呼び出しが存在することを検査する。ファイル全体の文字列一致では、コメントに書いただけ・
 * GET だけ守っている、といった状態を通してしまうため。
 *
 * ponytail: 全 API ルートの網羅表ではなく、**強制を検証済みのものを固定するための表**。
 * ここに載せないルートは「安全」を意味しない。認可未強制の変更系ルートは他にも残っており
 * （docs/context/OPEN_QUESTIONS.md）、強制を入れて検証したものからここへ足していく。
 * 「メソッドごとに要求が違い、1つの値で表せない」ルート（`admin/certificates/status` の
 * draft→active と active→void 等）は、この表ではなく操作単位の不変条件テストで縛る。
 * Next.js の middleware で一括強制する案は、テナントロールの解決に DB アクセスが要り
 * 全リクエストに載るため採らなかった。
 */
/** 変更系メソッド名。ルートごとにメソッド別の要求を書けるようにする。 */
export type MutatingMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/** ロール下限で守るルートの指定。 */
export type MinRoleRequirement = { minRole: Role };

/**
 * ハンドラ1つに課す要求。原則は Permission。マトリクスに対応する動詞が無い資源
 * （在庫・発注・部品・工程テンプレート等）だけロール下限で守る。
 */
export type MethodRequirement = Permission | MinRoleRequirement;

export type ApiRouteRequirement = MethodRequirement | Partial<Record<MutatingMethod, MethodRequirement>>;

export const API_ROUTE_PERMISSIONS: Record<string, ApiRouteRequirement> = {
  // 証明書の無効化（operationRisk = critical / 不可逆・法的意味を持つ）。
  // 経路ごとに認可が食い違っていた。無効化経路の網羅は別途 void-path テストが縛る。
  "certificates/void": "certificates:void",
  "admin/certificates/void": "certificates:void",
  "mobile/certificates/[id]/void": "certificates:void",

  // 設定変更。
  // 請求タイミングは金銭に直結する設定。テナント設定は owner のみ（代表判断 2026-09-04）。
  // 社名・銀行口座・ロゴと同じ扱いに揃える。
  "admin/billing-settings": { minRole: "owner" },
  // テナント設定は owner のみ（代表判断 2026-09-04）。DB 側も tenants_update_owner_admin を
  // 落として owner のみにしてある。片方だけだと 0 行更新の「嘘の成功」になる。
  "admin/settings/defaults": { minRole: "owner" },
  "admin/follow-up-settings": "settings:edit",
  "admin/faq": "settings:edit",
  "admin/tenant/external-api-key": "settings:edit",
  "admin/integrations/api-keys": "settings:edit",
  "admin/integrations/webhooks": "settings:edit",
  "admin/integrations/email-templates": "settings:edit",

  // AI 呼び出し（2026-09-01 代表判断: staff 以上）。呼ぶたびに費用が出るため
  // 閲覧専用ロールを弾く。対応する Permission が語彙に無いのでロール下限で守る。
  "admin/accounting/ai-categorize": { minRole: "staff" },
  "admin/ask": { minRole: "staff" },
  "admin/certificates/ai-draft": { minRole: "staff" },
  "admin/certificates/ai-explain": { minRole: "staff" },
  "admin/certificates/ai-quality": { minRole: "staff" },
  "admin/certificates/photo-tampering": { minRole: "staff" },
  "admin/certificates/voice-memo": { minRole: "staff" },
  "admin/customer-inquiries/[id]/ai-classify": { minRole: "staff" },
  "admin/customer-messages/[id]/ai-extract": { minRole: "staff" },
  "admin/field-knowledge/ask": { minRole: "staff" },
  "admin/inspection-records/ocr": { minRole: "staff" },
  "admin/inventory/ai-pos-deduct": { minRole: "staff" },
  "admin/invoices/ai-from-job": { minRole: "staff" },
  "admin/jobs/[id]/ai-suggest": { minRole: "staff" },
  "admin/market-vehicles/[id]/ai-description": { minRole: "staff" },
  "admin/master-data/normalize": { minRole: "staff" },
  "admin/menu-items/[id]/ai-price": { minRole: "staff" },
  "admin/messages/[key]/ai-reply": { minRole: "staff" },
  "admin/messages/[key]/ai-summary": { minRole: "staff" },
  "admin/purchase-orders/ai-message": { minRole: "staff" },
  "admin/quotes/ai-from-vehicle": { minRole: "staff" },
  "admin/reservations/ai-from-message": { minRole: "staff" },
  "admin/reviews/ai-sentiment": { minRole: "staff" },
  "admin/square/orders/[id]/ai-link": { minRole: "staff" },
  "admin/thickness-reports/[reportId]/ai-anomaly": { minRole: "staff" },
  "admin/translate": { minRole: "staff" },
  "admin/voice-note": { minRole: "staff" },
  "identity/ocr": { minRole: "staff" },
  "mobile/identity/ocr": { minRole: "staff" },

  // 設定・マスタ（2026-09-01 代表判断: admin 以上に統一）。
  // 権限名は UI の ROUTE_PERMISSIONS と揃える（同じ画面と同じ語彙で判断できるように）。
  "admin/booking-settings": "settings:edit",
  "admin/edge/devices": "settings:edit",
  "admin/equipment-master": "settings:edit",
  "admin/sales-targets": "settings:edit",
  "admin/setup/sample-data": "settings:edit",
  "admin/suppliers": "settings:edit",
  "admin/brands": "menu_items:manage",
  "admin/brands/[id]/products": "menu_items:manage",
  "admin/menu-items": "menu_items:manage",
  "admin/document-templates": "templates:manage",
  "admin/document-templates/tenant-default": "templates:manage",

  // メンバー・店舗・決済・レジ（既に強制済み。回帰を止めるために登録する）。
  // `admin/members` は PUT/DELETE が `caller.role !== "owner" && !== "admin"` の
  // インライン判定で、Permission 経由ではないため登録しない（登録すると偽の主張になる）。
  "admin/staff": "members:manage",
  "admin/staff/shifts": "members:manage",
  "admin/stores": "stores:manage",
  "admin/payments": { POST: "payments:create", PUT: "payments:manage", DELETE: "payments:manage" },
  "admin/registers": "registers:manage",

  // ── 業務データ CRUD（2026-09-01 代表判断: 権限マトリクスどおりに強制）──
  // マトリクスに動詞がある資源はその動詞で守る。動詞が無い資源（在庫・発注・部品・
  // 受注の更新・工程テンプレート・ショップ受注）は語彙を勝手に増やさず、
  // 閲覧専用ロールを弾くロール下限 { minRole: "staff" } で守る。
  // 足りない動詞（orders:edit / customers:delete / inventory:* / parts:* /
  // purchase_orders:*）は docs/context/OPEN_QUESTIONS.md に上げてある。

  // 証明書
  "certificates/create": "certificates:create",
  "certificates/edit": "certificates:edit",
  "certificates/[id]/media": "certificates:edit",
  "certificates/media/[id]": "certificates:edit",
  "certificates/images/upload": "certificates:edit",
  "certificates/images/[id]": "certificates:edit",
  "signature/request": "certificates:edit",
  "admin/certificates/[id]/delivery-receipt-request": "certificates:edit",
  // `admin/certificates` の POST は認可を createCertAction に集約しているため
  // ここには登録しない（登録するとルート内にガードが無く偽陽性になる）。

  // 車両
  "vehicles/create": "vehicles:create",
  "vehicles/[id]": "vehicles:edit",
  "vehicles/import-csv": "vehicles:create",
  "vehicles/parse-shakken": "vehicles:create", // 車検証 OCR。作成前段なので作成権限に合わせる
  "vehicles/parse-shakken-qr": "vehicles:create",

  // 請求書。同じファイルの DELETE だけが admin 以上を要求しており、POST/PUT は
  // 素通りだった（調査スクリプトがファイル単位で見ていたため見落とした）。
  // DELETE は既に minRole "admin" で守られている。表に載せて回帰を止める。
  "admin/invoices": { POST: "invoices:create", PUT: "invoices:edit", DELETE: { minRole: "admin" } },

  // NFC タグの廃止。車両に紐づく物理タグなので車両の編集権限で守る。
  "admin/nfc": { PATCH: "vehicles:edit", DELETE: { minRole: "admin" } },

  // 顧客
  // 削除だけ admin 以上（代表判断 2026-09-04）。顧客には施工履歴・証明書がぶら下がる
  // 不可逆操作なので、作成・編集（staff）とは分ける。
  // ロール下限ではなく専用の動詞にする。この表の原則は「対応する動詞が無い資源だけ
  // ロール下限」であり、顧客には customers:view/create/edit が既にある。
  // vehicles:delete が同じ形の先例。
  "admin/customers": { POST: "customers:create", PUT: "customers:edit", DELETE: "customers:delete" },
  "admin/customer-inquiries": "customers:edit",
  "admin/hearings": { POST: "customers:create", PUT: "customers:edit" },

  // 予約
  "admin/reservations/[id]/advance": "reservations:edit",
  "admin/reservations/[id]/handoff": "reservations:edit",
  "admin/reservations/[id]/start-workflow": "reservations:edit",

  // マーケット（BtoB）
  // 削除だけ admin 以上（代表判断 2026-09-04）。顧客削除と同じ理由。
  "admin/market-vehicles": { POST: "market:create", PUT: "market:edit", DELETE: "market:delete" },
  "admin/market-vehicles/images": "market:edit",
  "market/deals": "market:create",
  "market/deals/[id]": "market:edit",
  "market/deals/[id]/estimate": "market:edit",
  "market/deals/[id]/trade-in": "market:edit",
  "market/inquiries/[id]/reply": "market:edit",
  // `market/inquiries` の POST は買い手向けの公開フォーム（未認証・IP レート制限）
  // なので登録しない。GET だけが認証を使う。

  // 受注（マトリクスに orders:create しか無い。更新系はロール下限で守る）
  "admin/orders": { POST: "orders:create", PUT: { minRole: "staff" }, PATCH: { minRole: "staff" } },
  "admin/orders/bulk": "orders:create",
  // 入金の確定は executeOrderPayout / markOrderInvoicePaid を起動する不可逆操作。
  // 既存の `admin/payments` が PUT/DELETE に payments:manage を課しているのに揃える。
  "admin/orders/[id]/confirm-payment": "payments:manage",
  "admin/orders/[id]/inspection-sign": { minRole: "staff" },
  "admin/orders/[id]/messages": { minRole: "staff" },
  "admin/orders/[id]/review": { minRole: "staff" },

  // 在庫・発注・部品・工程テンプレート・ショップ受注（対応する Permission が語彙に無い）。
  // `templates:manage` は証明書テンプレート（/admin/templates）と帳票テンプレート用で、
  // 作業工程テンプレートは別資源。勝手に当てはめて admin 以上に上げることはしない。
  // 在庫は画面（ROUTE_PERMISSIONS の /admin/inventory・/admin/stocktake）が
  // menu_items:manage を要求している。API がそれより緩いと画面ゲートの意味が無い。
  "admin/inventory/items": "menu_items:manage",
  "admin/inventory/items/[id]": "menu_items:manage",
  "admin/inventory/movements": "menu_items:manage",
  "admin/purchase-orders": { minRole: "staff" },
  "admin/purchase-orders/[id]/backorder": { minRole: "staff" },
  "admin/shop/orders": { minRole: "admin" }, // 請求書払い。checkout と同じ買い物なので同じ下限
  "admin/workflow-templates": { minRole: "staff" },
  "admin/workflow-templates/[id]": { minRole: "staff" },
  "parts/confirmations": { minRole: "staff" },
  "parts/findings/[id]": { minRole: "staff" },
  "parts/installations": { minRole: "staff" },
  "parts/installations/[id]/delivery-note": { minRole: "staff" },
  "parts/installations/[id]/reconcile": { minRole: "staff" },
  "parts/installations/evidence-upload": { minRole: "staff" },

  // ── 決済・外部連携・帳票送付（2026-09-03 代表判断）──
  // Stripe 連携は会社の入金口座そのもので、解除されると入金が止まる。
  // billing:manage は admin も持つため、ロール下限 owner でさらに絞る。
  "stripe/connect": { minRole: "owner" },
  // 顧客への請求を出すのは現場の通常業務なので staff に開く。
  "stripe/connect/payment-link": "payments:create",
  // 備品購入は会社のお金を使うので、顧客への請求とは分けて admin 以上。
  // billing:manage は owner 以上でしか持たないため、ロール下限で「admin 以上」を表す。
  "admin/shop/checkout": { minRole: "admin" },
  // 帳票の顧客送付。マトリクスに送付の動詞が無いのでロール下限で守る。
  "admin/documents/share": { minRole: "staff" },

  // アカデミーの AI 機能。分類上はアカデミーだが中身は AI 呼び出しなので、
  // 「AI は staff 以上」（2026-09-01 代表判断）に従う。
  "admin/academy/feedback": { minRole: "staff" },
  "admin/academy/qa": { minRole: "staff" },
  // 事例公開も AI 要約を呼ぶ。テナント判定しか無く閲覧専用でも公開できていた。
  "admin/academy/cases": { minRole: "staff" },
};
