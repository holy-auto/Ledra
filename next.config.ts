import type { NextConfig } from "next";

let withSentryConfig: typeof import("@sentry/nextjs").withSentryConfig | undefined;
try {
  withSentryConfig = require("@sentry/nextjs").withSentryConfig;
} catch {
  // @sentry/nextjs not available — skip wrapping
}

// Bundle analyzer: only active when ANALYZE=true so it doesn't slow down
// regular builds. Output goes to .next/analyze/{client,server}.html which
// the bundle-size CI gate parses. See docs/operations-guide.md.
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports
const withBundleAnalyzer: (cfg: NextConfig) => NextConfig =
  process.env.ANALYZE === "true"
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@next/bundle-analyzer")({ enabled: true })
    : (c: NextConfig) => c;

const nextConfig: NextConfig = {
  reactCompiler: true,
  compress: true,
  poweredByHeader: false,

  serverExternalPackages: [
    "@react-pdf/renderer",
    // Native binary module — cannot be bundled by Turbopack
    "@contentauth/c2pa-node",
    // AWS SDK は署名器 aws-kms モード時のみ動的 import。大きいのでバンドルせず外部化する。
    "@aws-sdk/client-kms",
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

  async redirects() {
    return [
      // 令和の虎 出演キャンペーン用の覚えやすいバニティリンク。
      // 放送 / SNS で案内する ledra.co.jp/tora を、UTM 付きで出演告知ページへ飛ばす。
      // ponytail: permanent:false(Next.js は 307 一時リダイレクトを返す) にしているのは、
      //   キャンペーン後に転送先を貼り替える前提のため(308/301 はブラウザに強くキャッシュ
      //   され、後からの差し替えが効かない)。
      // 依存: 転送先の /news 記事は放送(7/25 19:00)で draft 解除・公開されること。
      //   /tora の告知も 19:00 以降のみ行うため、公開前に踏まれて 404 になる導線は無い。
      {
        source: "/tora",
        destination:
          "/news/2026-07-25-reiwa-no-tora?utm_source=tora&utm_medium=broadcast&utm_campaign=reiwa-tora-2026",
        permanent: false,
      },
    ];
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
          // 機微 API (FLoC / interest-cohort, USB, シリアル, 支払い API 等) は
          // 全面禁止して PoC 中の意図しない browser API 漏出を抑える。
          {
            key: "Permissions-Policy",
            value: [
              "camera=(self)",
              "microphone=()",
              // 出張作業場所の記録に自サイト内でのみ位置情報を許可（作業開始/完了画面で使用）。
              // 第三者オリジンには開けない（(self) 限定）。他機能では位置情報は未使用。
              "geolocation=(self)",
              "payment=()",
              "usb=()",
              "serial=()",
              "bluetooth=()",
              "midi=()",
              "magnetometer=()",
              "accelerometer=()",
              "gyroscope=()",
              "ambient-light-sensor=()",
              "autoplay=()",
              "browsing-topics=()",
              "interest-cohort=()",
              "display-capture=()",
              "encrypted-media=()",
              "fullscreen=(self)",
              "screen-wake-lock=()",
              "sync-xhr=()",
              "xr-spatial-tracking=()",
            ].join(", "),
          },
          // HSTS: enforce HTTPS, 2 years, include subdomains.
          // `preload` は意図的に外している — preload list に登録すると数か月
          // 単位で外せなくなる片道契約のため、追加する場合は product 合意の
          // 上で個別判断する。max-age は OWASP 推奨の 2年に引き上げ。
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // Spectre / cross-window leak 対策。Stripe Checkout が popup を開く
          // 可能性があるため `same-origin-allow-popups` で互換性を残す
          // (`same-origin` だと window.opener が null になり一部 Stripe フロー
          // が壊れる)。
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
          // Spectre 系 side-channel 対策の追加防御。CORP=same-site にして
          // 同一サイト以外からの埋め込みを禁止。COEP は credentialless で
          // Stripe / Sentry / Supabase 等のクロスオリジン埋め込みを壊さない
          // モードで有効化。ブラウザは isolated context を提供する。
          { key: "Cross-Origin-Resource-Policy", value: "same-site" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          // Origin-Agent-Cluster: 同一 origin 内で document.domain による
          // XS-Leak を防ぎ、isolation を強化する。
          { key: "Origin-Agent-Cluster", value: "?1" },
          // Adobe Flash 用 cross-domain policy ファイルの参照を禁止
          // (legacy hardening — 害は無いので静かに付ける)。
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          // Legacy XSS auditor — Chrome は廃止済みだが古いブラウザに対する
          // 念のための保険。
          { key: "X-XSS-Protection", value: "0" },
          // 検索エンジン / プレビューに API レスポンス相当を index させない
          // ためのデフォルト。HTML ページではページ側で上書き可。
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
      // API レスポンスは検索エンジン indexing 完全禁止 + キャッシュ抑止。
      // proxy.ts で個別の API 応答にも付与しているが、ここでも source レベルで
      // 二重に保証する。
      {
        source: "/api/(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
          { key: "Cache-Control", value: "no-store, max-age=0" },
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
const sentryWrapped =
  withSentryConfig && process.env.SENTRY_AUTH_TOKEN
    ? withSentryConfig(nextConfig, sentryBuildOptions)
    : nextConfig;

export default withBundleAnalyzer(sentryWrapped);
