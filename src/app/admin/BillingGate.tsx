"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";

export default function BillingGate(): null {
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    (async () => {
      try {
        // billing 自体は除外（ループ防止）
        if (window.location.pathname.startsWith("/admin/billing")) return;

        // stale-while-revalidate: use cached state for instant check
        const CACHE_KEY = "ledra_billing_state";
        const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL && data?.tenant?.is_active !== false) {
              // Cache is fresh and active — skip blocking fetch
              // Still revalidate in background
              revalidate();
              return;
            }
            if (data?.tenant?.is_active === false) {
              redirectToBilling();
              return;
            }
          } catch {
            /* ignore corrupt cache */
          }
        }

        // No cache or expired — fetch and block
        await revalidate();
      } catch (e) {
        // Surface unexpected errors so they show up in Sentry / devtools.
        // The gate itself is best-effort: it must never prevent the admin
        // UI from loading, so we swallow the error after reporting.
        console.warn("[billing-gate] revalidate failed", e);
      }

      async function revalidate() {
        const s = await supabase.auth.getSession();
        const access_token = s.data?.session?.access_token;
        if (!access_token) return;

        const res = await fetch("/api/admin/billing-state", {
          method: "POST",
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ access_token }),
          cache: "no-store",
        });

        if (!res.ok) {
          console.warn("[billing-gate] revalidate non-ok", { status: res.status });
          return;
        }
        const j = await parseJsonSafe(res);
        if (!j) return;

        sessionStorage.setItem("ledra_billing_state", JSON.stringify({ data: j, ts: Date.now() }));

        if (j?.tenant?.is_active === false) {
          redirectToBilling();
        }
      }

      function redirectToBilling() {
        const ret = window.location.pathname + window.location.search;
        const dest = new URL("/admin/billing", window.location.origin);
        dest.searchParams.set("reason", "inactive");
        dest.searchParams.set("return", ret);
        window.location.replace(dest.toString());
      }
    })();
  }, [supabase]);

  return null;
}
