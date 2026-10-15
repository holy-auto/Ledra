#!/usr/bin/env node
/**
 * Ledra PR static impact map. Read-only, no dependencies.
 * Usage: node scripts/code-flow-impact.mjs [base-ref] [output-file]
 * Static import graph only; not runtime proof or a deletion oracle.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const base = process.argv[2] || "origin/main";
const output = process.argv[3] || "artifacts/code-flow-impact.md";
const root = process.cwd();
const sourceExt = /\.(?:ts|tsx|mts|js|jsx|mjs)$/;
const excluded = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "_backup", "_diag"]);
const norm = (s) => s.split(path.sep).join("/");
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) walk(path.join(dir, entry.name));
    } else if (entry.isFile() && sourceExt.test(entry.name)) {
      files.push(norm(path.relative(root, path.join(dir, entry.name))));
    }
  }
}
for (const dir of ["src", "apps/mobile/src", "apps/mobile/app", "apps/watch"]) {
  if (existsSync(dir)) walk(dir);
}
const known = new Set(files);
const extensions = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];
function resolveImport(from, spec) {
  let stem;
  if (spec.startsWith("@/")) stem = "src/" + spec.slice(2);
  else if (spec.startsWith(".")) stem = norm(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
  else return null;
  for (const candidate of [stem, ...extensions.map((ext) => stem + ext), ...extensions.map((ext) => stem + "/index" + ext)]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}
const reverse = new Map();
const edges = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // Conservative lexical import scan; may include comments and miss dynamic computed imports.
  // Static import/export, bare side-effect import, and literal dynamic import/require.
  // Avoid a cross-statement regex that could accidentally attach an unrelated string.
  const specs = /\b(?:import|export)\s+(?:(?:[^;"'\n]*?\s+from\s*)?["']([^"'\n]+)["'])|\b(?:import|require)\s*\(\s*["']([^"'\n]+)["']/g;
  for (const match of src.matchAll(specs)) {
    const dep = resolveImport(file, match[1] || match[2]);
    if (!dep) continue;
    if (!reverse.has(dep)) reverse.set(dep, new Set());
    reverse.get(dep).add(file);
    if (!edges.has(dep)) edges.set(dep, new Set());
    edges.get(dep).add(file);
  }
}
let changed = [];
try {
  const diff = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMR", base + "...HEAD"], { encoding: "utf8" });
  changed = diff.trim().split("\n").filter(Boolean).map(norm);
} catch (e) {
  console.error("Cannot compare against " + base + ". Fetch base ref first.", e.message);
  process.exit(1);
}
const affected = new Map();
for (const target of changed.filter((f) => known.has(f))) {
  const seen = new Set([target]);
  const queue = [[target, 0]];
  while (queue.length) {
    const [current, depth] = queue.shift();
    for (const caller of reverse.get(current) || []) {
      if (seen.has(caller)) continue;
      seen.add(caller);
      affected.set(caller, Math.min(affected.get(caller) ?? Infinity, depth + 1));
      queue.push([caller, depth + 1]);
    }
  }
}
const githubUrl = "https://github.com/holy-auto/Ledra/blob/" + encodeURIComponent(process.env.GITHUB_SHA || "main") + "/";
const fileLink = (f) => "[`" + f.replaceAll("|", "\\|") + "`](" + githubUrl + f.split("/").map(encodeURIComponent).join("/") + ")";
const relevant = new Set(changed.filter((f) => known.has(f)));
for (const file of affected.keys()) relevant.add(file);
const graphEdges = [];
for (const [dependency, callers] of edges) {
  if (!relevant.has(dependency)) continue;
  for (const caller of callers) if (relevant.has(caller)) graphEdges.push([dependency, caller]);
}
const graphNodes = [...relevant].sort().slice(0, 60);
const nodeSet = new Set(graphNodes);
const nodeId = new Map(graphNodes.map((f, i) => [f, "N" + i]));
const graph = [
  "flowchart LR",
  ...graphNodes.map((f) => '  ' + nodeId.get(f) + '["' + f.replaceAll('"', "'") + '"]'),
  ...graphEdges.filter(([a,b]) => nodeSet.has(a) && nodeSet.has(b)).slice(0, 150).map(([a,b]) => '  ' + nodeId.get(a) + ' --> ' + nodeId.get(b)),
  ...graphNodes.map((f) => '  click ' + nodeId.get(f) + ' "' + githubUrl + f.split("/").map(encodeURIComponent).join("/") + '"'),
];
const escape = (s) => s.replaceAll("|", "\\|").replaceAll("\n", " ");
const lines = [
  "# Ledra PR code-flow impact (static estimate)",
  "",
  "Base: `" + escape(base) + "` · Generated: " + new Date().toISOString(),
  "",
  "> **静的推定のみ。** import依存元を探索した結果であり、実際に実行された経路ではありません。Next.jsの自動ルーティング、SQL/RLS、cron、webhook、外部クライアント、動的参照は別途レビューが必要。参照がないことを削除の根拠にしない。",
  "",
  "## Changed files (" + changed.length + ")",
  ...changed.map((f) => "- " + fileLink(f)),
  "",
  "## Reverse import dependents (" + affected.size + ")",
  "| Depth | Importing file |",
  "| ---: | --- |",
  ...[...affected].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).slice(0, 200).map(([f, d]) => "| " + d + " | " + fileLink(f) + " |"),
  ...(affected.size > 200 ? ["", "Only first 200 shown."] : []),
  "",
  "## Dependency map (dependency → importer; first 60 nodes / 150 edges)",
  "",
  "```mermaid",
  ...graph,
  "```",
  "",
  "## Manual impact checklist",
  "- [ ] API/route entry points and permissions",
  "- [ ] Tenant isolation, RLS, migration and database consumers",
  "- [ ] QStash, cron, webhook, outbox and external API",
  "- [ ] Tests, runtime trace, retry and idempotency",
  "- [ ] Keep / merge / delete candidate / defer (with evidence)",
  ""
];
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n"));
console.log("Generated " + output + ": " + changed.length + " changed, " + affected.size + " reverse dependents");
