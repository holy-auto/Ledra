#!/usr/bin/env node
/**
 * Emit format-valid PLACEHOLDER environment variables for CI production builds.
 *
 * Why this exists:
 *   `next build` runs page-data collection (prerender) for every route. Several
 *   Route Handlers instantiate SDK clients (Supabase, QStash, Upstash, Stripe, …)
 *   at *module scope*, and those constructors throw when their env vars are
 *   missing (e.g. "supabaseUrl is required", "currentSigningKey and
 *   nextSigningKey are required"). CI intentionally holds no real secrets, so a
 *   bare `next build` aborts during page-data collection — which previously made
 *   the "Client Bundle Size" job fail at the *build step*, before the size check
 *   ever ran.
 *
 *   By synthesising format-valid placeholders for every key in `.env.example`,
 *   the production build completes end to end (compile + prerender + static
 *   generation). That keeps `next build` STRICT in CI: a genuine page-data /
 *   prerender regression (a route throwing for a non-secret reason) still fails
 *   the build, while the size check runs against a real, complete manifest.
 *
 * Usage (CI): `node scripts/gen-ci-build-env.js > .env.local` before `npm run build`.
 *
 * This prints to stdout only — it never writes files — so running it locally
 * cannot clobber a developer's real `.env.local`. The values are obvious dummies
 * and are never used to reach a real backend (no network calls happen at build).
 *
 * SENTRY_AUTH_TOKEN is intentionally omitted: setting it switches `next.config`
 * to the Sentry build wrapper (source-map upload + altered client bundle), which
 * CI deliberately avoids. See `.github/workflows/ci.yml` (bundle-size job).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const EXAMPLE_PATH = path.join(process.cwd(), ".env.example");
if (!fs.existsSync(EXAMPLE_PATH)) {
  console.error(`gen-ci-build-env: ${EXAMPLE_PATH} not found`);
  process.exit(1);
}

/** Pick a format-valid placeholder for a given env var name. */
function placeholderFor(key) {
  // URL/URI/DSN-shaped values must parse as URLs (clients validate this).
  if (/(URL|URI|DSN)$/.test(key)) {
    if (/SUPABASE/.test(key)) return "https://dummy.supabase.co";
    if (/UPSTASH/.test(key)) return "https://dummy.upstash.io";
    if (/DSN$/.test(key)) return "https://dummy@dummy.ingest.sentry.io/0";
    return "https://dummy.example.com";
  }
  // Feature flags off — keeps optional integrations (Polygon anchoring, etc.)
  // from initialising at module scope on dummy credentials.
  if (/ENABLED$|FAIL_CLOSED$/.test(key)) return "false";
  // Numeric-ish settings.
  if (/DAYS$|HOURS$|SLOTS$|MIN_CERT$|MIN_SHOP$|VERSION$|BALANCE_POL$/.test(key)) return "1";
  if (/TENANT_ID$/.test(key)) return "00000000-0000-0000-0000-000000000000";
  if (/STRIPE_SECRET_KEY$/.test(key)) return "sk_test_dummy";
  // Crypto material: leave empty so module-scope key parsing is skipped
  // (the gated code paths are disabled via the *_ENABLED=false flags above).
  if (/PRIVATE_KEY$|SIGNER_KEY$/.test(key)) return "";
  return "dummy";
}

const lines = fs.readFileSync(EXAMPLE_PATH, "utf8").split("\n");
const out = [];
for (const line of lines) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
  if (!m) continue;
  const key = m[1];
  if (key === "SENTRY_AUTH_TOKEN") continue; // see header
  out.push(`${key}=${placeholderFor(key)}`);
}

process.stdout.write(out.join("\n") + "\n");
