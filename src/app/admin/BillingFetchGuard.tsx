"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    __billingFetchGuardInstalled?: boolean;
  }
}

type XhrWithGuardUrl = XMLHttpRequest & { __billing_guard_url?: string };

function redirectToBilling(billingUrl: string | null) {
  if (window.location.pathname.startsWith("/admin/billing")) return;

  const dest = new URL(billingUrl || "/admin/billing", window.location.origin);
  const ret = window.location.pathname + window.location.search;
  dest.searchParams.set("return", ret);

  window.location.href = dest.toString();
}

function fetchInputToUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

export default function BillingFetchGuard(): null {
  useEffect(() => {
    if (window.__billingFetchGuardInstalled) return;
    window.__billingFetchGuardInstalled = true;

    // ---- fetch hook (optimized: early-exit for non-API and success responses) ----
    const origFetch = window.fetch.bind(window);
    const OrigXhrOpen = XMLHttpRequest.prototype.open;
    const OrigXhrSend = XMLHttpRequest.prototype.send;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const res = await origFetch(input, init);

      // Fast path: skip non-error responses (vast majority of requests)
      if (res.status !== 402 && res.status !== 403) return res;

      try {
        const rawUrl = fetchInputToUrl(input);
        if (!rawUrl) return res;

        // Only intercept same-origin /api/ calls
        if (!rawUrl.startsWith("/api/") && !rawUrl.includes("/api/")) return res;

        const u = new URL(rawUrl, window.location.origin);
        if (u.origin !== window.location.origin) return res;
        if (!u.pathname.startsWith("/api/")) return res;

        // header 優先 → body fallback
        let billingUrl: string | null = res.headers.get("x-billing-url");

        if (!billingUrl) {
          try {
            const j = (await res.clone().json()) as { billing_url?: string } | null;
            billingUrl = j?.billing_url ?? null;
          } catch {
            /* body is not JSON — fall through to default /admin/billing */
          }
        }

        redirectToBilling(billingUrl);
      } catch {
        /* any failure in the guard must not surface to callers */
      }

      return res;
    };

    // ---- XHR hook (axios 等) ----
    // XMLHttpRequest.open has two DOM overload signatures. Calling the
    // original through `.call` with all five parameters covers both — Node
    // optional args default to undefined and Chrome/Firefox both tolerate
    // trailing undefineds on the 2-arg form.
    XMLHttpRequest.prototype.open = function (
      this: XhrWithGuardUrl,
      method: string,
      url: string | URL,
      async: boolean = true,
      username?: string | null,
      password?: string | null,
    ): void {
      try {
        this.__billing_guard_url = String(url ?? "");
      } catch {
        /* ignore */
      }
      OrigXhrOpen.call(this, method, url, async, username ?? null, password ?? null);
    } as typeof XMLHttpRequest.prototype.open;

    XMLHttpRequest.prototype.send = function (this: XhrWithGuardUrl, body?: Document | XMLHttpRequestBodyInit | null) {
      this.addEventListener("loadend", function (this: XhrWithGuardUrl) {
        try {
          if (this.status !== 402 && this.status !== 403) return;

          const rawUrl = this.__billing_guard_url;
          if (!rawUrl) return;

          const u = new URL(rawUrl, window.location.origin);
          if (u.origin !== window.location.origin) return;
          if (!u.pathname.startsWith("/api/")) return;

          redirectToBilling("/admin/billing");
        } catch {
          /* ignore */
        }
      });

      return OrigXhrSend.call(this, body);
    };

    return () => {
      window.fetch = origFetch;
      XMLHttpRequest.prototype.open = OrigXhrOpen;
      XMLHttpRequest.prototype.send = OrigXhrSend;
      window.__billingFetchGuardInstalled = false;
    };
  }, []);

  return null;
}
