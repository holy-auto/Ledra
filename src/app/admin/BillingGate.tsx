"use client";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BillingGate() {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      try {
        // billing 自体は除外（ループ防止）
        if (window.location.pathname.startsWith("/admin/billing")) return;

        const s = await supabase.auth.getSession();
        const access_token = s.data?.session?.access_token;
        if (!access_token) return; // 未ログインは既存導線に任せる

        const res = await fetch("/api/admin/billing-state", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ access_token }),
          cache: "no-store",
        });

        if (!res.ok) return;
        const j = await res.json().catch(() => null);

        if (j?.tenant?.is_active === false) {
          const ret = window.location.pathname + window.location.search;
          const dest = new URL("/admin/billing", window.location.origin);
          dest.searchParams.set("reason", "inactive");
          dest.searchParams.set("return", ret);
          window.location.replace(dest.toString());
        }
      } catch {}
    })();
  }, [supabase]);

  return null;
}
