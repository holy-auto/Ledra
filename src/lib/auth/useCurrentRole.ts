"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "./roles";
import { normalizeRole } from "./roles";
import { hasPermission, type Permission } from "./permissions";

type MeData = {
  user_id: string;
  email: string;
  tenant_id: string;
  tenant_name: string | null;
  plan_tier: string;
  role: Role;
};

let cachedData: MeData | null = null;
let fetchPromise: Promise<MeData | null> | null = null;

async function fetchMe(): Promise<MeData | null> {
  try {
    const res = await fetch("/api/admin/me", { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return { ...j, role: normalizeRole(j.role) };
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
      if (!data) return false;
      return hasPermission(data.role, permission);
    },
    [data],
  );

  return {
    data,
    loading,
    role: data?.role ?? null,
    can,
    refresh,
  };
}
