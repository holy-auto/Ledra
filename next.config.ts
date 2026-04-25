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
          // HSTS: enforce HTTPS, 1 year, include subdomains.
          // `preload` は意図的に外している — preload list に登録すると数か月
          // 単位で外せなくなる片道契約のため、追加する場合は product 合意の
          // 上で個別判断する。
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Spectre / cross-window leak 対策。Stripe Checkout が popup を開く
          // 可能性があるため `same-origin-allow-popups` で互換性を残す
          // (`same-origin` だと window.opener が null になり一部 Stripe フロー
          // が壊れる)。
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Adobe Flash 用 cross-domain policy ファイルの参照を禁止
          // (legacy hardening — 害は無いので静かに付ける)。
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
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
