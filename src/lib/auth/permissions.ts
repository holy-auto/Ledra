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
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
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
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
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
    "reservations:view",
    "reservations:create",
    "reservations:edit",
    "invoices:view",
    "invoices:create",
    "invoices:edit",
    "market:view",
    "market:create",
    "market:edit",
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
    "site_content:view",
    "site_content:manage",
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
    "site_content:view",
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

export const API_ROUTE_PERMISSIONS: Record<string, Permission | Partial<Record<MutatingMethod, Permission>>> = {
  // 証明書の無効化（operationRisk = critical / 不可逆・法的意味を持つ）。
  // 経路ごとに認可が食い違っていた。無効化経路の網羅は別途 void-path テストが縛る。
  "certificates/void": "certificates:void",
  "admin/certificates/void": "certificates:void",
  "mobile/certificates/[id]/void": "certificates:void",

  // 設定変更。
  "admin/billing-settings": "settings:edit",
  "admin/settings/defaults": "settings:edit",
  "admin/follow-up-settings": "settings:edit",
  "admin/faq": "settings:edit",
  "admin/tenant/external-api-key": "settings:edit",
  "admin/integrations/api-keys": "settings:edit",
  "admin/integrations/webhooks": "settings:edit",
  "admin/integrations/email-templates": "settings:edit",

  // メンバー・店舗・決済・レジ（既に強制済み。回帰を止めるために登録する）。
  // `admin/members` は PUT/DELETE が `caller.role !== "owner" && !== "admin"` の
  // インライン判定で、Permission 経由ではないため登録しない（登録すると偽の主張になる）。
  "admin/staff": "members:manage",
  "admin/staff/shifts": "members:manage",
  "admin/stores": "stores:manage",
  "admin/payments": { POST: "payments:create", PUT: "payments:manage", DELETE: "payments:manage" },
  "admin/registers": "registers:manage",
};
