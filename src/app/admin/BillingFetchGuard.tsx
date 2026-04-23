"use client";

import { useEffect } from "react";

function redirectToBilling(billingUrl: string | null) {
  if (window.location.pathname.startsWith("/admin/billing")) return;

  const dest = new URL(billingUrl || "/admin/billing", window.location.origin);
  const ret = window.location.pathname + window.location.search;
  dest.searchParams.set("return", ret);

  window.location.href = dest.toString();
}

export default function BillingFetchGuard(): null {
  useEffect(() => {
    if ((window as any).__billingFetchGuardInstalled) return;
    (window as any).__billingFetchGuardInstalled = true;

    // ---- fetch hook (optimized: early-exit for non-API and success responses) ----
    const origFetch = window.fetch.bind(window);
    const OrigXhrOpen = XMLHttpRequest.prototype.open;
    const OrigXhrSend = XMLHttpRequest.prototype.send;

    window.fetch = async (input: any, init?: any) => {
      const res = await origFetch(input, init);

      // Fast path: skip non-error responses (vast majority of requests)
      if (res.status !== 402 && res.status !== 403) return res;

      try {
        const rawUrl = typeof input === "string" ? input : input?.url;
        if (!rawUrl) return res;

        // Only intercept same-origin /api/ calls
        if (typeof rawUrl === "string" && !rawUrl.startsWith("/api/") && !rawUrl.includes("/api/")) return res;

        const u = new URL(rawUrl, window.location.origin);
        if (u.origin !== window.location.origin) return res;
        if (!u.pathname.startsWith("/api/")) return res;

        // header 優先 → body fallback
        let billingUrl: string | null = res.headers.get("x-billing-url");

        if (!billingUrl) {
          try {
            const j = await res.clone().json();
            billingUrl = j?.billing_url ?? null;
          } catch {}
        }

        redirectToBilling(billingUrl);
      } catch {}

      return res;
    };

    // ---- XHR hook (axios 等) ----
    XMLHttpRequest.prototype.open = function (...args: any[]) {
      try {
        // open(method, url, ...)
        (this as any).__billing_guard_url = String(args?.[1] ?? "");
      } catch {}
      return (OrigXhrOpen as any).apply(this, args);
    };

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      this.addEventListener("loadend", function () {
        try {
          const status = (this as any).status as number;
          if (status !== 402 && status !== 403) return;

          const rawUrl = (this as any).__billing_guard_url as string | undefined;
          if (!rawUrl) return;

          const u = new URL(rawUrl, window.location.origin);
          if (u.origin !== window.location.origin) return;
          if (!u.pathname.startsWith("/api/")) return;

          redirectToBilling("/admin/billing");
        } catch {}
      });

      return (OrigXhrSend as any).apply(this, args);
    };

    return () => {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = OrigXhrOpen;
      XMLHttpRequest.prototype.send = OrigXhrSend;
      (window as any).__billingFetchGuardInstalled = false;
    };
  }, []);

  return null;
}
