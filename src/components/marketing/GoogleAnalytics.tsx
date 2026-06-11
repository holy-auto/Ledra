"use client";

import { useEffect } from "react";

/**
 * Loads Google Analytics 4 (gtag.js) on the marketing site.
 *
 * No-ops unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set AND the visitor has
 * granted analytics consent (`__ledra_consent` cookie === "granted") — the
 * same gate PostHogProvider uses, so both honour one cookie banner.
 *
 * gtag.js is injected as an *external* script, which CSP permits via the
 * googletagmanager.com entry in `script-src` (an external `src` needs no
 * nonce). The bootstrap runs as ordinary bundled JS — there is no inline
 * <script> to carry the per-request nonce. See src/lib/security/csp.ts.
 */
export function GoogleAnalytics(): null {
  useEffect(() => {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId) return;
    if (typeof window === "undefined") return;
    if (readConsent() !== "granted") return;
    if (window.__ga4Initialized) return;
    window.__ga4Initialized = true;

    const dataLayer = (window.dataLayer = window.dataLayer ?? []);
    // gtag.js consumes the native `arguments` object verbatim — replicate the
    // canonical bootstrap rather than pushing a plain array.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params -- gtag.js requires the literal arguments object
      dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }, []);

  return null;
}

function readConsent(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/__ledra_consent=(granted|denied)/);
  return (m?.[1] as "granted" | "denied" | undefined) ?? null;
}
