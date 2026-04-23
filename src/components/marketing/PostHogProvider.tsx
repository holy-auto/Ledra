"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Initializes PostHog on mount. Waits for consent before capturing events.
 * Consent is tracked via the `__ledra_consent` cookie ("granted" | "denied").
 *
 * Only active when `NEXT_PUBLIC_POSTHOG_KEY` is set. Otherwise no-ops.
 */
export function PostHogProvider(): null {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    if (typeof window === "undefined") return;
    if (window.posthog) return;

    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com";
    const consent = readConsent();

    posthog.init(key, {
      api_host: host,
      capture_pageview: false, // manual pageviews: we call capture('$pageview') after consent
      persistence: "localStorage+cookie",
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: consent !== "granted",
      loaded: (ph) => {
        if (consent === "granted") ph.capture("$pageview");
      },
    });

    // Expose for the analytics module
    window.posthog = posthog as unknown as Window["posthog"];
  }, []);

  return null;
}

function readConsent(): "granted" | "denied" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/__ledra_consent=(granted|denied)/);
  return (m?.[1] as "granted" | "denied" | undefined) ?? null;
}
