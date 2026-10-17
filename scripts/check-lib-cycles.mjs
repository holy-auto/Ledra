#!/usr/bin/env node
/**
 * `src/lib` のモジュール同士の循環依存を、今より増やさない検査。
 *
 * ## なぜ要るか
 *
 * gitdiagram 等の構成図では「証明書 → サイン → 決済 → アンカー」が一方向に流れて見えるが、
 * 2026-10-17 に import を数えたら、certificates / parts / anchoring / line / ai など
 * 図の中心にある 19 モジュールが**互いに呼び合う1つのかたまり**になっていた
 * （型だけの import を除いた実行時の依存で）。図の箱の境界がコード上では守られておらず、
 * 1つを変えると残り全部に影響しうる。図を描いてもこれは見えない。
 *
 * 今ある循環は一度に解かない（LINE クライアントや画像アップロードが AI 自動化を直接
 * 呼んでいる等、依存の向きを変える設計判断が要る）。まず**新しい循環を作らせない**。
 *
 * ## 何を比べるか
 *
 * - モジュール = `src/lib` 直下のディレクトリ名、または直下ファイル名（拡張子なし）。
 * - 循環辺 = 同じ強連結成分（互いに到達できるかたまり）の中を結ぶ依存。
 *   これは定義上すべて何らかの循環の一部。
 * - `scripts/lib-cycles.baseline.json` にある循環辺の一覧と突き合わせ、
 *   **増えたら落とす**。減ったのに一覧が古いままでも落とす（一覧を縮めないと、
 *   直した循環を後で黙って戻せてしまう）。
 *
 * 走らせ方: npm run check:lib-cycles（CI の ci-parallel-checks.sh からも走る）
 *           npm run check:lib-cycles -- --update   ← 循環を減らしたあとに一覧を縮める
 *
 * ponytail: import は正規表現で拾う（TypeScript の解析器を使わない）。
 * 天井: `import { type A }` のように型だけをインライン指定した import は実行時の依存として
 * 数える（安全側）。文字列リテラル中の `from "..."` を誤って拾いうる。誤検出が
 * 問題になったら dependency-cruiser（docs/diagrams/code-flow-observability-proposal.md の
 * Phase 1）に置き換える。
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname, resolve, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const LIB = join(ROOT, "src/lib");
const BASELINE = join(ROOT, "scripts/lib-cycles.baseline.json");

/** `certificates/issueHooks.ts` → `certificates`、`logger.ts` → `logger`。 */
export function moduleOf(relPath) {
  return relPath.split(/[\\/]/)[0].replace(/\.tsx?$/, "");
}

/**
 * ソースから実行時に効く import 指定子を拾う。
 * `import type` / `export type` は実行時に消えるので落とす。コメント内の例示も落とす。
 */
export function extractImports(source) {
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\b(?:import|export)\s+type\s[^;]*?from\s*["'][^"']+["']/g, "");
  const specs = [];
  const re =
    /\b(?:import|export)\b[^"';]*?\bfrom\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm;
  for (const m of code.matchAll(re)) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

/**
 * files: `src/lib` からの相対パス → ソース。返り値: モジュール → 依存先モジュールの Set
 * と、辺ごとの原因ファイル（`a -> b` → [relPath]）。
 */
export function buildGraph(files) {
  const graph = new Map();
  const causes = new Map();
  for (const [rel, src] of Object.entries(files)) {
    const from = moduleOf(rel);
    if (!graph.has(from)) graph.set(from, new Set());
    for (const spec of extractImports(src)) {
      let target;
      if (spec.startsWith("@/lib/")) target = moduleOf(spec.slice("@/lib/".length));
      else if (spec.startsWith(".")) {
        const r = relative(LIB, resolve(LIB, dirname(rel), spec));
        if (r.startsWith("..")) continue;
        target = moduleOf(r.split(sep).join("/"));
      } else continue;
      if (!target || target === from) continue;
      graph.get(from).add(target);
      const key = `${from} -> ${target}`;
      if (!causes.has(key)) causes.set(key, []);
      causes.get(key).push(rel);
    }
  }
  return { graph, causes };
}

/** 強連結成分（Tarjan）の中を結ぶ辺を `a -> b` の昇順で返す。 */
export function cyclicEdges(graph) {
  let next = 0;
  const index = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const comp = new Map();
  const visit = (v) => {
    index.set(v, next);
    low.set(v, next);
    next++;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) {
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.set(w, v);
      } while (w !== v);
    }
  };
  // ponytail: 再帰。モジュール数は 150 程度なので深さの上限に届かない。
  for (const v of graph.keys()) if (!index.has(v)) visit(v);

  const edges = [];
  for (const [a, targets] of graph) {
    for (const b of targets) if (graph.has(b) && comp.get(a) === comp.get(b)) edges.push(`${a} -> ${b}`);
  }
  return edges.sort();
}

/** 現在の循環辺と一覧を比べる。 */
export function compareWithBaseline(current, baseline) {
  const base = new Set(baseline);
  const cur = new Set(current);
  return {
    added: current.filter((e) => !base.has(e)),
    removed: baseline.filter((e) => !cur.has(e)),
  };
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function main() {
  const files = Object.fromEntries(
    walk(LIB).map((p) => [relative(LIB, p).split(sep).join("/"), readFileSync(p, "utf8")]),
  );
  const { graph, causes } = buildGraph(files);
  const current = cyclicEdges(graph);
  // 空を「循環ゼロ」と読まない。読み取りが壊れても緑になってしまう。
  if (graph.size === 0) {
    console.error("check-lib-cycles: src/lib からモジュールを1つも読めなかった。読み取りが壊れている");
    process.exit(1);
  }

  if (process.argv.includes("--update")) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    console.log(`check-lib-cycles: 一覧を更新した（循環辺 ${current.length} 本）`);
    return;
  }

  const { added, removed } = compareWithBaseline(current, JSON.parse(readFileSync(BASELINE, "utf8")));
  if (added.length || removed.length) {
    const lines = ["check-lib-cycles: src/lib の循環依存が一覧と違う"];
    if (added.length) {
      lines.push(`\n  新しく循環に入った依存 ${added.length} 本（この PR で循環を作った）:`);
      for (const e of added) lines.push(`    ${e}   ← ${causes.get(e).slice(0, 3).join(", ")}`);
      lines.push(
        "\n  直し方: 呼ぶ向きを逆にする（下の層が上の層を直接呼ばない）。共通部分を別モジュールへ切り出す。" +
          "\n  一覧に足して通すのは最後の手段（PR 本文に理由を書く）: npm run check:lib-cycles -- --update",
      );
    }
    if (removed.length) {
      lines.push(`\n  循環が解けた依存 ${removed.length} 本（一覧が古い）:`);
      for (const e of removed) lines.push(`    ${e}`);
      lines.push("\n  一覧を縮める: npm run check:lib-cycles -- --update");
    }
    console.error(lines.join("\n"));
    process.exit(1);
  }

  const inCycles = new Set(current.flatMap((e) => e.split(" -> ")));
  console.log(
    `check-lib-cycles: OK（${graph.size} モジュール中 ${inCycles.size} が循環、循環辺 ${current.length} 本。増減なし）`,
  );
}

// テストから import されたときは実行しない。
if (process.argv[1] && process.argv[1].endsWith("check-lib-cycles.mjs")) main();
