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

// .ds-sync/ is the design-sync skill's own converter toolchain, staged into
// this repo by that skill's setup step — it's gitignored (see .gitignore)
// and never committed, so a fresh checkout without having run the skill
// first won't have it. Fail with a clear pointer instead of a bare
// MODULE_NOT_FOUND several steps in.
if (!fs.existsSync(".ds-sync/package-build.mjs")) {
  console.error(
    "✗ .ds-sync/package-build.mjs not found.\n" +
    "  This is the design-sync skill's converter toolchain, intentionally not\n" +
    "  committed (see .gitignore). Run the design-sync skill's setup step\n" +
    "  first to stage .ds-sync/ before invoking this script.",
  );
  process.exit(1);
}

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
