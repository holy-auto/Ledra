# Content-Security-Policy & security headers

## Where the policy lives

- **Builder**: `src/lib/security/csp.ts` (`buildCsp` / `serializeCsp` /
  `buildCspHeader`). Single source of truth, unit-tested in
  `src/lib/security/__tests__/csp.test.ts`.
- **Apply point**: `src/proxy.ts` — generates a 16-byte nonce per request,
  stores it on `x-nonce` so server components can read it via
  `headers().get("x-nonce")`, then sets the `Content-Security-Policy`
  header on every response.
- **Static security headers** (HSTS, X-Frame-Options, COOP, …):
  `next.config.ts` → `headers()`.

CSP cannot live in `next.config.ts` because the per-request nonce can't be
expressed there.

## Policy summary

| Directive | Allowlist | Why |
| --------- | --------- | --- |
| `default-src` | `'self'` | tightest possible default |
| `script-src` | `'self'` + per-request nonce + Stripe.js, Vercel Live, `*.vercel-scripts.com`, `*.sentry-cdn.com`. `'unsafe-eval'` only in dev. | inline scripts must carry the nonce; no `'unsafe-inline'` |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind / react-pdf / Next font-loader inject inline `<style>`; nonce propagation to Next CSS injection isn't supported |
| `img-src` | `'self' data: blob:` + Supabase + `api.qrserver.com` | thumbnails, QR fallback, upload preview |
| `font-src` | `'self' data:` + `cdn.jsdelivr.net` | Noto Sans JP for certificate PDFs |
| `connect-src` | `'self'` + Supabase, Stripe API, Sentry, Vercel Live, Upstash, `*.posthog.com` | XHR / fetch targets used in the app |
| `frame-src` | Stripe.js / Stripe hooks / Vercel Live | Checkout iframe + Vercel preview comments |
| `media-src` | `'none'` | no audio / video |
| `object-src` | `'none'` | no plugins |
| `base-uri` | `'self'` | block base-tag injection |
| `form-action` | `'self'` | block form-jacking |
| `frame-ancestors` | `'none'` | block clickjacking |
| `worker-src` | `'self'` | for `public/sw.js`; explicit so audit is obvious |
| `manifest-src` | `'self'` | PWA manifest |

## Adding an external origin

Real bugs come from allowlisting things "in case we use them" or forgetting
to allowlist things we already use. Both directions cause incidents:
PostHog telemetry was silently CSP-blocked before this audit because
`*.posthog.com` was missing from `connect-src` even though the SDK was
shipped.

Process:

1. Grep the codebase for the actual URL pattern (`grep -rE "https://example\." src`).
2. If it's a script loaded via `<script src>`, add to `script-src`.
3. If it's an XHR/fetch/EventSource target, add to `connect-src`.
4. If it's an `<img>` or CSS `url(...)`, add to `img-src` / `font-src`.
5. If it's an iframe, add to `frame-src`.
6. Update the test in `csp.test.ts` so the regression check has teeth.
7. Update this doc.

Wildcards are OK for first-party + well-scoped vendor domains
(`*.supabase.co`, `*.posthog.com`); avoid them for arbitrary CDNs.

## Static security headers (`next.config.ts`)

| Header | Value | Why |
| ------ | ----- | --- |
| `X-Frame-Options` | `DENY` | redundant with CSP `frame-ancestors 'none'` but kept for older browsers |
| `X-Content-Type-Options` | `nosniff` | block MIME-sniffing XSS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | sane default |
| `Permissions-Policy` | `camera=(self), microphone=(), geolocation=()` | car-passport scanner needs camera; nothing else |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | 1 year, no preload (preload is a one-way commitment — needs product approval) |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | Spectre-class isolation; `same-origin` would break Stripe popup flows |
| `X-Permitted-Cross-Domain-Policies` | `none` | legacy Adobe Flash hardening, harmless to set |

Headers we deliberately **do not** set:

- `Cross-Origin-Embedder-Policy: require-corp` — would break Stripe iframe and any cross-origin image we legitimately load. Not worth it without SharedArrayBuffer.
- `Cross-Origin-Resource-Policy` — would either break legitimate cross-origin embedding (e.g. Slack unfurling) or be a no-op. Skipping until a concrete need surfaces.
- `HSTS preload` — submitting the domain to the preload list is a one-way commitment; defer until product OK.

## Testing the policy in browser

To smoke-test CSP locally:

```bash
npm run build
npm start
# visit http://localhost:3000 and watch DevTools → Console for CSP reports
```

Common false-positives to ignore:
- Browser extension scripts (Grammarly, password managers) — these are user
  agents, not our code.
- `chrome-extension://...` source URLs in CSP reports.

## Tests

`src/lib/security/__tests__/csp.test.ts` has 19 cases pinning down each
directive's allowlist. If you intentionally remove an origin, update the
test in the same commit.
