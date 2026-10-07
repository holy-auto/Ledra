/**
 * Typed analytics event emitters for the marketing site.
 *
 * Events are sent to PostHog and GA4 (gtag.js) when each is loaded and the
 * user has given consent. Calling these functions before the providers are
 * ready (or before consent) is safe — they no-op silently.
 */

import type { LeadSource } from "./leads";
import { isMarketingPath } from "./routes";

/** Dispatched on `window` when the visitor grants analytics consent. */
export const ANALYTICS_CONSENT_EVENT = "ledra:analytics-consent";

type PostHogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  opt_in_capturing?: () => void;
  opt_out_capturing?: () => void;
};

declare global {
  interface Window {
    posthog?: PostHogLike;
    /** GA4 gtag.js queue & helper — see components/marketing/GoogleAnalytics.tsx */
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    /** Guards against double-injecting gtag.js (React StrictMode / re-mounts). */
    __ga4Initialized?: boolean;
  }
}

function client(): PostHogLike | null {
  if (typeof window === "undefined") return null;
  return window.posthog ?? null;
}

export type MarketingEvent =
  | { name: "cta_clicked"; props: { location: string; label: string; href?: string } }
  | { name: "lead_submitted"; props: { source: LeadSource; resource_key?: string } }
  | { name: "document_download_started"; props: { resource_key: string } }
  | { name: "document_download_completed"; props: { resource_key: string; bytes: number; ms: number } }
  | { name: "document_download_failed"; props: { resource_key: string; reason: string } }
  | { name: "roi_calculated"; props: { monthly_certs: number; hours_per_cert: number; estimated_saving_yen: number } }
  | { name: "form_validation_failed"; props: { source: LeadSource; reason?: string } }
  | { name: "page_section_viewed"; props: { section: string } }
  | { name: "experiment_exposed"; props: { experiment: string; variant: string } };

export function track<E extends MarketingEvent>(event: E): void {
  client()?.capture(event.name, event.props as Record<string, unknown>);
  // GA4 gets the same events so `lead_submitted` can be marked as a key event
  // (GA's own form_submit also fires on app forms like /admin/*).
  if (typeof window !== "undefined") window.gtag?.("event", event.name, event.props);
}

/** Pages GA4 counts: the HP plus /signup, the trial step an HP CTA leads to. */
export function isGaTrackedPath(pathname: string): boolean {
  return isMarketingPath(pathname) || pathname === "/signup";
}

export function grantAnalyticsConsent(): void {
  client()?.opt_in_capturing?.();
  // Signal opt-in to analytics that initialise on consent (e.g. GA4 / gtag.js).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
  }
}

export function revokeAnalyticsConsent(): void {
  client()?.opt_out_capturing?.();
}
