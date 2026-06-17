"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "./roles";
import { normalizeRole } from "./roles";
import { hasPermission, type Permission } from "./permissions";

type MeData = {
  user_id: string;
  email: string;
  tenant_id: string | null;
  tenant_name: string | null;
  plan_tier: string;
  /** 本社専用ユーザ (テナント未所属) は null。 */
  role: Role | null;
  is_platform_admin: boolean;
  /** 本社 (組織) 側のユーザか。 */
  is_org_user: boolean;
  /** 組織オーナーか。 */
  is_org_owner: boolean;
};

let cachedData: MeData | null = null;
let fetchPromise: Promise<MeData | null> | null = null;

async function fetchMe(): Promise<MeData | null> {
  try {
    const res = await fetch("/api/admin/me", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return {
      ...j,
      // role は null を保持する (本社専用ユーザ)。null を normalizeRole すると
      // "admin" になり全権付与されてしまうため、明示的にガードする。
      role: j.role ? normalizeRole(j.role) : null,
      is_platform_admin: j.is_platform_admin === true,
      is_org_user: j.is_org_user === true,
      is_org_owner: j.is_org_owner === true,
    };
  } catch {
    return null;
  }
}

/**
 * Client hook to get the current user's role and permissions.
 * Caches the result for the session.
 */
export function useCurrentRole() {
  const [data, setData] = useState<MeData | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);

  const refresh = useCallback(async () => {
    if (!fetchPromise) {
      fetchPromise = fetchMe();
    }
    const result = await fetchPromise;
    fetchPromise = null;
    cachedData = result;
    setData(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!cachedData) refresh();
  }, [refresh]);

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!data || !data.role) return false;
      return hasPermission(data.role, permission);
    },
    [data],
  );

  return {
    data,
    loading,
    role: data?.role ?? null,
    isPlatformAdmin: data?.is_platform_admin === true,
    isOrgUser: data?.is_org_user === true,
    isOrgOwner: data?.is_org_owner === true,
    can,
    refresh,
  };
}
