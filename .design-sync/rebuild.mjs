// The single, canonical rebuild command for this repo's design-sync — run
// this instead of invoking tailwind-build.mjs / entry-build.mjs /
// package-build.mjs / the font-license copy as separate manual steps.
// (A prior version of this repo's docs described those as 3-4 separate
// commands a human or re-syncing agent had to remember in order — Codex
// correctly flagged that the font-license copy step was never actually
// wired to anything and would be silently skipped on a normal re-sync.
// Folding every step into one script removes that failure mode entirely.)
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const OUT = process.argv[2] ?? "./ds-bundle";

console.log("[1/4] compiling Tailwind CSS...");
execFileSync("node", [".design-sync/tailwind-build.mjs"], { stdio: "inherit" });

console.log("[2/4] generating curated bundle entry...");
execFileSync("node", [".design-sync/entry-build.mjs"], { stdio: "inherit" });

console.log("[3/4] running package-build.mjs...");
execFileSync(
  "node",
  [
    ".ds-sync/package-build.mjs",
    "--config",
    ".design-sync/config.json",
    "--node-modules",
    "./node_modules",
    "--entry",
    ".design-sync/.cache/entry.mjs",
    "--out",
    OUT,
  ],
  { stdio: "inherit" },
);

console.log("[4/4] copying font license notices...");
for (const f of ["OFL-NotoSansJP.txt", "OFL-GeistMono.txt"]) {
  fs.copyFileSync(`.design-sync/fonts/${f}`, `${OUT}/fonts/${f}`);
}

console.log(`\n✓ rebuild complete → ${OUT}`);
