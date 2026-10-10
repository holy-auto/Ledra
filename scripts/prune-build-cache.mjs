#!/usr/bin/env node
/**
 * `next build` の後に、ビルドキャッシュから使われなくなった Turbopack の版を消し、
 * キャッシュの大きさをビルドログに出す。
 *
 * なぜ要るか（DECISION_LOG / OPEN_QUESTIONS 2026-10-07〜09「Vercel のビルド機（Elastic）…」）:
 * Vercel は前回のビルドキャッシュ（node_modules と .next/cache）を復元するが、大きすぎると捨てて
 * 一から全部ビルドする。手元の実測（2026-10-09、Next 16.3.8）で、全部ビルドはピーク約 7.2GB、
 * キャッシュありは約 2.5GB。8GB 機が選ばれた回にキャッシュが捨てられると OOM で落ちる。
 *
 * Turbopack のキャッシュは `.next/cache/turbopack/v<Nextの版>-<hash>/` に版ごとに作られ、
 * Next を上げると新しい版のディレクトリが増える。古い版はもう読まれないのに、しばらく残って
 * 一緒にアップロードされる（1 版で約 0.9GB）。ここで今の版だけを残す。
 *
 * 今の版のキャッシュは消さない（消すと次のビルドが全部ビルドになり、守りたいものを自分で壊す）。
 * ビルドを落とさないことを優先し、失敗しても終了コード 0 で抜ける。
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * 残すディレクトリと消すディレクトリを決める。
 * `v<nextVersion>-` で始まるものを残す。どれも当てはまらなければ（命名が変わった等）、
 * 何も消さない（消す根拠が無いものは消さない）。
 */
export function planTurbopackPrune(dirNames, nextVersion) {
  const versionDirs = dirNames.filter((n) => /^v\d/.test(n));
  const prefix = `v${nextVersion}-`;
  const keep = versionDirs.filter((n) => n.startsWith(prefix));
  if (keep.length === 0) return { keep: versionDirs, remove: [] };
  return { keep, remove: versionDirs.filter((n) => !n.startsWith(prefix)) };
}

function sizeMB(path) {
  try {
    const out = execFileSync("du", ["-sm", path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Number(out.split(/\s/)[0]);
  } catch {
    return null;
  }
}

export function pruneBuildCache(root) {
  const turboDir = join(root, ".next", "cache", "turbopack");
  const nextVersion = JSON.parse(readFileSync(join(root, "node_modules", "next", "package.json"), "utf8")).version;
  const removed = [];
  if (existsSync(turboDir)) {
    const names = readdirSync(turboDir).filter((n) => statSync(join(turboDir, n)).isDirectory());
    const { remove } = planTurbopackPrune(names, nextVersion);
    for (const n of remove) {
      const p = join(turboDir, n);
      const mb = sizeMB(p);
      rmSync(p, { recursive: true, force: true });
      removed.push(`${n}（${mb ?? "?"}MB）`);
    }
  }
  const report = [
    `[build-cache] next ${nextVersion}`,
    `[build-cache] 古い Turbopack キャッシュを削除: ${removed.length ? removed.join(", ") : "なし"}`,
    `[build-cache] .next/cache ${sizeMB(join(root, ".next", "cache")) ?? "?"}MB` +
      `（うち turbopack ${sizeMB(turboDir) ?? "?"}MB）、node_modules ${sizeMB(join(root, "node_modules")) ?? "?"}MB（いずれも圧縮前）`,
  ];
  return { removed, report };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { report } = pruneBuildCache(process.cwd());
    for (const line of report) console.log(line);
  } catch (e) {
    console.warn(`[build-cache] キャッシュの整理に失敗（ビルドは続行）: ${e instanceof Error ? e.message : e}`);
  }
}
