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
 */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  "/admin": "dashboard:view",
  "/admin/certificates": "certificates:view",
  "/admin/vehicles": "vehicles:view",
  "/admin/customers": "customers:view",
  "/admin/reservations": "reservations:view",
  "/admin/invoices": "invoices:view",
  "/admin/management": "management:view",
  "/admin/menu-items": "menu_items:manage",
  "/admin/inventory": "menu_items:manage",
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
