import type { NextConfig } from "next";

let withSentryConfig: typeof import("@sentry/nextjs").withSentryConfig | undefined;
try {
  withSentryConfig = require("@sentry/nextjs").withSentryConfig;
} catch {
  // @sentry/nextjs not available — skip wrapping
}

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Exclude worktree directories from Turbopack/Webpack scanning to prevent
  // infinite symlink loops caused by "holy-cert": "file:" in package.json
  serverExternalPackages: ["holy-cert"],

  // Next 16.1.6: Server Actions config is under experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.supabase.in",
      },
    ],
  },

  async headers() {
    // Trusted external origins for CSP
    const cspDirectives = [
      "default-src 'self'",
      // Scripts: self + Stripe.js + Vercel Analytics/Speed Insights + Sentry + inline for Next.js
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://vercel.live https://*.vercel-scripts.com https://*.sentry-cdn.com",
      // Styles: self + inline (Tailwind/react-pdf)
      "style-src 'self' 'unsafe-inline'",
      // Images: self + data URIs + Supabase + QR code API + blob
      "img-src 'self' data: blob: https://*.supabase.co https://*.supabase.in https://api.qrserver.com",
      // Fonts: self + fontsource CDN (for NotoSansJP in PDF generation)
      "font-src 'self' data: https://cdn.jsdelivr.net",
      // Connect: self + Supabase + Stripe + Sentry + Vercel + Upstash
      "connect-src 'self' https://*.supabase.co https://*.supabase.in https://api.stripe.com https://*.sentry.io https://*.ingest.sentry.io https://vercel.live https://*.vercel-scripts.com https://*.upstash.io",
      // Frames: Stripe checkout iframe
      "frame-src https://js.stripe.com https://hooks.stripe.com https://vercel.live",
      // Media: none needed
      "media-src 'none'",
      // Object: none
      "object-src 'none'",
      // Base URI restriction
      "base-uri 'self'",
      // Form action restriction
      "form-action 'self'",
      // Frame ancestors: none (replaces X-Frame-Options)
      "frame-ancestors 'none'",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS: enforce HTTPS, 1 year, include subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // CSP in Report-Only mode first — switch to Content-Security-Policy after validation
          { key: "Content-Security-Policy-Report-Only", value: cspDirectives },
        ],
      },
    ];
  },
};

const sentryBuildOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only upload source maps when SENTRY_AUTH_TOKEN is set (CI/deploy)
  silent: !process.env.CI,
  disableLogger: true,

  // Widen bundle size limit to avoid build warnings
  widenClientFileUpload: true,

  // Skip source map upload when auth token is not available (local dev)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
};

// Apply Sentry wrapper only at build time (CI/deploy), not during dev.
// withSentryConfig modifies Webpack/Turbopack and can cause path issues in dev worktrees.
export default withSentryConfig && process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, sentryBuildOptions)
  : nextConfig;
