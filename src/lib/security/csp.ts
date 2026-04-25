/**
 * Content-Security-Policy builder.
 *
 * Centralized so that the policy is unit-testable and additions / removals
 * are auditable in one place. proxy.ts imports `buildCspHeader` and applies
 * the result on every response.
 *
 * The policy is **strict-by-default**:
 *   - script-src has no `'unsafe-inline'`; every inline `<script>` carries a
 *     per-request nonce read from `headers().get('x-nonce')` in server
 *     components.
 *   - frame-ancestors 'none' blocks clickjacking.
 *   - object-src 'none' / media-src 'none' lock down legacy plugins.
 *   - form-action 'self' blocks form-jacking.
 *
 * Each external origin in the allowlist is justified inline below. Adding
 * a new origin requires:
 *   1. confirming the package/feature actually loads from there (grep, not
 *      vibes — see docs/operations/csp.md);
 *   2. updating both this file AND its test (`csp.test.ts`).
 */

type CspDirective =
  | "default-src"
  | "script-src"
  | "style-src"
  | "img-src"
  | "font-src"
  | "connect-src"
  | "frame-src"
  | "media-src"
  | "object-src"
  | "base-uri"
  | "form-action"
  | "frame-ancestors"
  | "worker-src"
  | "manifest-src";

export type CspOptions = {
  /** Per-request nonce for script-src. Required. */
  nonce: string;
  /** When true, script-src adds `'unsafe-eval'` for Next.js dev HMR. */
  isDev: boolean;
};

export function buildCsp(options: CspOptions): Record<CspDirective, string[]> {
  const { nonce, isDev } = options;

  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    // Stripe.js (Checkout / Elements / Terminal browser SDK)
    "https://js.stripe.com",
    // Vercel Live preview comments
    "https://vercel.live",
    // Vercel Analytics / Speed Insights — script CDN
    "https://*.vercel-scripts.com",
    // Sentry browser SDK loader (only used if loader script is enabled)
    "https://*.sentry-cdn.com",
  ];
  if (isDev) scriptSrc.push("'unsafe-eval'");

  return {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    // 'unsafe-inline' here is a known compromise: Tailwind, react-pdf and
    // Next.js's font loader inject inline <style>. Nonce propagation to
    // Next.js's CSS injection is not yet supported.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": [
      "'self'",
      "data:", // base64 thumbnails, react-pdf rasterization
      "blob:", // client-side QR generation, image upload preview
      "https://*.supabase.co",
      "https://*.supabase.in",
      "https://api.qrserver.com", // QR fallback (referral links, certificate PDF)
    ],
    "font-src": [
      "'self'",
      "data:", // PDF font embedding produces data: URLs
      "https://cdn.jsdelivr.net", // Noto Sans JP for certificate PDFs
    ],
    "connect-src": [
      "'self'",
      "https://*.supabase.co",
      "https://*.supabase.in",
      "https://api.stripe.com",
      "https://*.sentry.io",
      "https://*.ingest.sentry.io",
      "https://vercel.live",
      "https://*.vercel-scripts.com",
      "https://*.upstash.io",
      // PostHog telemetry (only active when NEXT_PUBLIC_POSTHOG_KEY is set,
      // but allowlisting unconditionally avoids per-env CSP surgery and
      // doesn't expand attack surface — there is no script-src entry).
      "https://*.posthog.com",
      "https://*.i.posthog.com",
    ],
    "frame-src": ["https://js.stripe.com", "https://hooks.stripe.com", "https://vercel.live"],
    "media-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    // Service worker (public/sw.js). Without this the SW falls back to
    // script-src 'self' which works, but explicit is better for audit.
    "worker-src": ["'self'"],
    // PWA manifest at /manifest.json (same-origin). Without this it falls
    // back to default-src 'self' which is also fine; included for clarity.
    "manifest-src": ["'self'"],
  };
}

/** Serialize the directive map to the canonical header value. */
export function serializeCsp(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
    .join("; ");
}

/** Convenience: build + serialize in one call. */
export function buildCspHeader(options: CspOptions): string {
  return serializeCsp(buildCsp(options));
}
