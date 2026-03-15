export type Role = "owner" | "admin" | "staff" | "viewer";

export const ROLES: Role[] = ["owner", "admin", "staff", "viewer"];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "オーナー",
  admin: "管理者",
  staff: "スタッフ",
  viewer: "閲覧者",
};

const ROLE_RANK: Record<Role, number> = {
  owner: 4,
  admin: 3,
  staff: 2,
  viewer: 1,
};

export function normalizeRole(v: unknown): Role {
  const s = String(v ?? "").toLowerCase();
  if (s === "owner") return "owner";
  if (s === "staff") return "staff";
  if (s === "viewer") return "viewer";
  return "admin"; // default fallback
}

/** Check if a role meets the minimum required role level */
export function hasMinRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/** Assignable roles (owner can't be assigned via UI) */
export const ASSIGNABLE_ROLES: Role[] = ["admin", "staff", "viewer"];
