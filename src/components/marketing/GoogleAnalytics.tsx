"use client";

import { useEffect } from "react";
import { ANALYTICS_CONSENT_EVENT, isGaTrackedPath } from "@/lib/marketing/analytics";

/**
 * Loads Google Analytics 4 (gtag.js) on the marketing site.
 *
 * No-ops unless `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set AND the visitor has
 * granted analytics consent (`__ledra_consent` cookie === "granted"). On mount
 * it starts immediately for returning visitors who already consented; for a
 * fresh visitor it also listens for the consent-granted event the cookie
 * banner fires (via grantAnalyticsConsent), so the consenting session is
 * tracked without a reload — the same liveness PostHog gets from
 * opt_in_capturing().
 *
 * gtag.js is injected as an *external* script, which CSP permits via the
 * googletagmanager.com entry in `script-src` (an external `src` needs no
 * nonce). The bootstrap runs as ordinary bundled JS — there is no inline
 * <script> to carry the per-request nonce. See src/lib/security/csp.ts.
 */
export function GoogleAnalytics(): null {
  useEffect(() => {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (!measurementId || typeof window === "undefined") return;

    const start = () => {
      if (readConsent() !== "granted") return;
      if (window.__ga4Initialized) return;
      window.__ga4Initialized = true;

      // gtag.js survives client-side navigation into the app (/login → /admin),
      // and its history-change page_views were counting app screens as HP
      // traffic. The opt-out flag is a getter so it follows the current path.
      // ponytail: relies on gtag.js reading `ga-disable-<id>` per hit (not
      // verifiable here — googletagmanager.com is blocked); if app paths still
      // show in GA4 realtime, switch to manual page_views instead.
      // The setter keeps the documented `window["ga-disable-<id>"] = true` opt-out working.
      let optedOut = false;
      Object.defineProperty(window, `ga-disable-${measurementId}`, {
        configurable: true,
        get: () => optedOut || !isGaTrackedPath(window.location.pathname),
        set: (value: unknown) => {
          optedOut = Boolean(value);
        },
      });

      const dataLayer = (window.dataLayer = window.dataLayer ?? []);
      // gtag.js consumes the native `arguments` object verbatim — replicate
      // the canonical bootstrap rather than pushing a plain array.
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
    };

    start();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, start);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, start);
  }, []);

  return null;
}

function readConsent(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/__ledra_consent=(granted|denied)/);
  return (m?.[1] as "granted" | "denied" | undefined) ?? null;
}
