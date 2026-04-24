/**
 * Typed analytics event emitters for the marketing site.
 *
 * Events are sent to PostHog when the client library is loaded and the
 * user has given consent. Calling these functions before the provider is
 * ready (or before consent) is safe — they no-op silently.
 */

import type { LeadSource } from "./leads";

type PostHogLike = {
  capture: (event: string, props?: Record<string, unknown>) => void;
  opt_in_capturing?: () => void;
  opt_out_capturing?: () => void;
};

declare global {
  interface Window {
    posthog?: PostHogLike;
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
  | { name: "page_section_viewed"; props: { section: string } };

export function track<E extends MarketingEvent>(event: E): void {
  const ph = client();
  if (!ph) return;
  ph.capture(event.name, event.props as Record<string, unknown>);
}

export function grantAnalyticsConsent(): void {
  client()?.opt_in_capturing?.();
}

export function revokeAnalyticsConsent(): void {
  client()?.opt_out_capturing?.();
}
