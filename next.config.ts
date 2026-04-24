import type { NextConfig } from "next";

let withSentryConfig: typeof import("@sentry/nextjs").withSentryConfig | undefined;
try {
  withSentryConfig = require("@sentry/nextjs").withSentryConfig;
} catch {
  // @sentry/nextjs not available — skip wrapping
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,

  serverExternalPackages: [
    "@react-pdf/renderer",
    // Native binary module — cannot be bundled by Turbopack
    "@contentauth/c2pa-node",
  ],

  // Pin Turbopack root to this directory to prevent path resolution issues in worktrees
  turbopack: {
    root: ".",
  },

  // Next 16.1.6: Server Actions config is under experimental
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: [
      "@supabase/ssr",
      "@supabase/supabase-js",
      "@upstash/redis",
      "@upstash/ratelimit",
      "zod",
      // マーケティングページで動的 import されるコンポーネント
      "@vercel/analytics",
      "@vercel/speed-insights",
    ],
  },

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
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
    // NOTE: Content-Security-Policy is set per-request in `src/proxy.ts` so
    // that it can include a per-request nonce for `script-src`. Setting it
    // here would override with a static (and weaker) policy.
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 車検証 QR スキャナ (src/components/vehicles/ShakenshoScanner.tsx) が
          // navigator.mediaDevices.getUserMedia({ video }) を呼ぶため camera は
          // 自サイトに限り許可。マイクと位置情報は現状使っていないので禁止のまま。
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
          // HSTS: enforce HTTPS, 1 year, include subdomains
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
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
