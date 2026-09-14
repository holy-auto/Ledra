"use client";

import { useEffect, useState } from "react";

export type AdminBillingStatus = {
  tenant_id: string;
  tenant_name?: string | null;
  plan_tier: string;
  is_active: boolean;
};

export function useAdminBillingStatus() {
  const [data, setData] = useState<AdminBillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/billing-status", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as AdminBillingStatus;
        if (alive) setData(j);
      } catch {
        // 失敗時は null のまま（UIは従来どおり表示、API側で止まる）
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading };
}
