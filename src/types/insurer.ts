/** Insurer (保険会社) plan tiers */
export type InsurerPlanTier = "basic" | "pro" | "enterprise";

/** Insurer role within an insurer organization */
export type InsurerRole = "admin" | "viewer" | "auditor";

export const INSURER_PLAN_RANK: Record<InsurerPlanTier, number> = {
  basic: 1,
  pro: 2,
  enterprise: 3,
};

/**
 * プランごとのユーザー数上限。
 * insurers テーブルに `max_users` 列は無く、以前はそれを SELECT していたため
 * 契約情報とユーザー管理の画面が動いていなかった。上限はプランで決まるので
 * ここに置く。
 * ponytail: 上限。テナントごとに個別枠を売る運用になったら、
 * insurers に列を足してこの表を既定値にする。
 */
export const INSURER_MAX_USERS: Record<InsurerPlanTier, number> = {
  basic: 5,
  pro: 20,
  enterprise: 100,
};

export function insurerMaxUsers(plan: InsurerPlanTier): number {
  return INSURER_MAX_USERS[plan] ?? INSURER_MAX_USERS.basic;
}

export const INSURER_ROLE_RANK: Record<InsurerRole, number> = {
  auditor: 1,
  viewer: 2,
  admin: 3,
};

/** Features gated by insurer plan tier */
export const INSURER_PLAN_FEATURES: Record<
  InsurerPlanTier,
  {
    search: boolean;
    view: boolean;
    csv_export: boolean;
    pdf_export: boolean;
    bulk_user_import: boolean;
    api_access: boolean;
    max_users: number;
  }
> = {
  basic: {
    search: true,
    view: true,
    csv_export: false,
    pdf_export: false,
    bulk_user_import: false,
    api_access: false,
    max_users: 3,
  },
  pro: {
    search: true,
    view: true,
    csv_export: true,
    pdf_export: true,
    bulk_user_import: true,
    api_access: false,
    max_users: 20,
  },
  enterprise: {
    search: true,
    view: true,
    csv_export: true,
    pdf_export: true,
    bulk_user_import: true,
    api_access: true,
    max_users: 9999,
  },
};

export function normalizeInsurerPlanTier(raw: string | null | undefined): InsurerPlanTier {
  if (raw === "pro" || raw === "enterprise") return raw;
  return "basic";
}

export function normalizeInsurerRole(raw: string | null | undefined): InsurerRole {
  if (raw === "admin" || raw === "auditor") return raw;
  return "viewer";
}
