// Generates a hand-curated bundle entry — `export * from <absolute path>`
// for every componentSrcMap-included component — instead of letting the
// converter's synth-entry mode `export *` every .tsx file under
// src/components/ui/. That whole-directory scan would also pull in the
// componentSrcMap-excluded files (next/navigation-coupled shell components,
// Supabase-fetching components), and one of them (Sidebar.tsx, via
// next/image) evaluates `process.env` at module top level — undefined in a
// browser bundle, which crashes the entire IIFE before any component
// reaches window.<globalName>. Passing this file via `--entry` bypasses
// synth-entry mode entirely (resolveDistEntry treats an existing --entry
// path as a real dist build).
import fs from "node:fs";
import path from "node:path";

const cfg = JSON.parse(fs.readFileSync(".design-sync/config.json", "utf8"));
const entries = Object.entries(cfg.componentSrcMap).filter(([, v]) => v !== null);

// This repo's UI components are almost all `export default function Name()`
// — `export * from` (the converter's own synth-entry strategy) silently
// drops every default export, since ES modules never re-export `default`
// via a wildcard. Re-export explicitly, keyed off whether the source file
// actually has a top-level `export default`.
// ponytail: hasDefault only recognizes the literal `export default …` form
// (checked against all 33 mapped files today — all match). A component
// added later that exports via `export { Foo as default }` or re-exports
// someone else's default would be misclassified and fail to bundle with an
// esbuild "no matching export" error. Upgrade path: parse with ts-morph
// (already a converter dependency) instead of a regex if that ever happens.
const componentLines = entries.map(([name, relPath]) => {
  const abs = path.resolve(relPath);
  const src = fs.readFileSync(abs, "utf8");
  const hasDefault = /^export default\b/m.test(src);
  return hasDefault
    ? `export { default as ${name} } from ${JSON.stringify(abs)};`
    : `export { ${name} } from ${JSON.stringify(abs)};`;
});

// Non-component named exports (hooks, etc.) that authored previews compose
// with alongside their owning component — not PascalCase, so they can't go
// through componentSrcMap, but still need to resolve on window.Ledra.
const EXTRA_EXPORTS = [{ name: "useToast", path: "src/components/ui/Toast.tsx" }];
const extraLines = EXTRA_EXPORTS.map(
  ({ name, path: relPath }) => `export { ${name} } from ${JSON.stringify(path.resolve(relPath))};`,
);

const out = [...componentLines, ...extraLines].join("\n") + "\n";
fs.mkdirSync(".design-sync/.cache", { recursive: true });
fs.writeFileSync(".design-sync/.cache/entry.mjs", out);
console.log(`wrote .design-sync/.cache/entry.mjs (${entries.length} components)`);
