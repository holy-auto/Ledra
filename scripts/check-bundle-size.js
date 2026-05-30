#!/usr/bin/env node
/**
 * CI gate: assert that the production build's client-side JS hasn't blown up.
 *
 * Reads `.next/build-manifest.json` after `next build` and computes the
 * total size of every chunk listed under `rootMainFiles` + `pages["/"]`.
 * If the sum exceeds CLIENT_BUNDLE_MAX_KB (default 1200 KB gzipped-ish via
 * raw byte proxy), exits 1 to fail the CI job.
 *
 * This is intentionally simple — no per-route detail, no comparison with
 * main. We just want a tripwire that catches "someone import()'d the entire
 * stripe SDK at the root" before the PR merges. Detailed analysis comes from
 * `npm run build:analyze` (visual HTML report).
 *
 * Override the threshold via env: CLIENT_BUNDLE_MAX_KB=900 npm run check:bundle-size
 *
 * Reference: docs/architecture-roadmap.md §9.4
 */
"use strict";

const fs = require("fs");
const path = require("path");

const NEXT_DIR = path.join(process.cwd(), ".next");
const MANIFEST_PATH = path.join(NEXT_DIR, "build-manifest.json");
// 2026-05-30: 850 → 1200 KB に二段階引き上げ。
// 理由は .github/workflows/ci.yml の同名 env コメント参照。
// 局所的に厳しくしたい場合は CLIENT_BUNDLE_MAX_KB env で override。
const DEFAULT_MAX_KB = 1200;

function fail(msg) {
  console.error(`\n❌ check:bundle-size — ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST_PATH)) {
  fail(`build-manifest.json not found at ${MANIFEST_PATH}. Run \`npm run build\` first.`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

// Collect every distinct chunk referenced from the root: shared chunks plus
// the index route. This proxies "JS the user pays for on a cold first visit".
const chunks = new Set();
for (const f of manifest.rootMainFiles ?? []) chunks.add(f);
for (const f of manifest.pages?.["/"] ?? []) chunks.add(f);
for (const f of manifest.pages?.["/_app"] ?? []) chunks.add(f);

if (chunks.size === 0) {
  fail("no chunks found in build-manifest.json — manifest schema may have changed");
}

let totalBytes = 0;
const detail = [];
for (const chunk of chunks) {
  const p = path.join(NEXT_DIR, chunk);
  if (!fs.existsSync(p)) continue; // some manifest entries are dev-only
  const stat = fs.statSync(p);
  totalBytes += stat.size;
  detail.push({ chunk, kb: Math.round(stat.size / 1024) });
}

const totalKb = Math.round(totalBytes / 1024);
const maxKb = Number(process.env.CLIENT_BUNDLE_MAX_KB ?? DEFAULT_MAX_KB);

detail.sort((a, b) => b.kb - a.kb);
console.log(`\nclient bundle (root + "/" + "/_app"):`);
console.log(`  chunks:     ${chunks.size}`);
console.log(`  total raw:  ${totalKb} KB`);
console.log(`  threshold:  ${maxKb} KB`);
console.log(`\ntop 5 chunks:`);
for (const d of detail.slice(0, 5)) {
  console.log(`  ${d.kb.toString().padStart(5)} KB  ${d.chunk}`);
}

if (totalKb > maxKb) {
  fail(
    `client bundle ${totalKb} KB exceeds threshold ${maxKb} KB. ` +
      `Run \`npm run build:analyze\` and open .next/analyze/client.html to find the offender. ` +
      `Override only via CLIENT_BUNDLE_MAX_KB if the growth is intentional and reviewed.`,
  );
}

console.log(`\n✅ bundle size OK (${totalKb} / ${maxKb} KB)\n`);
