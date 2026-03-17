/** Insurer (保険会社) plan tiers */
export type InsurerPlanTier = "basic" | "pro" | "enterprise";

/** Insurer role within an insurer organization */
export type InsurerRole = "admin" | "viewer" | "auditor";

export const INSURER_PLAN_RANK: Record<InsurerPlanTier, number> = {
  basic: 1,
  pro: 2,
  enterprise: 3,
};

export const INSURER_ROLE_RANK: Record<InsurerRole, number> = {
  auditor: 1,
  viewer: 2,
  admin: 3,
};

/** Features gated by insurer plan tier */
export const INSURER_PLAN_FEATURES: Record<InsurerPlanTier, {
  search: boolean;
  view: boolean;
  csv_export: boolean;
  pdf_export: boolean;
  bulk_user_import: boolean;
  api_access: boolean;
  max_users: number;
}> = {
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
