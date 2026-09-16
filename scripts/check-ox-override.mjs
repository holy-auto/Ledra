#!/usr/bin/env node
/**
 * `overrides.ox` が viem の要求する ox を下回っていないかを検査する。
 *
 * なぜ要るか（2026-09-14・DECISION_LOG 参照）:
 * `ox` はアプリから直接 import していないが、`package.json` の `overrides` で
 * ツリー全体を1本に固定している。viem は `ox` を**完全一致で pin** して内部 API を
 * 直接使うため、overrides が viem の pin より古いと、viem が使う export が
 * 解決できずクライアントビルドが落ちる。
 *
 *     Error: Export MultisigOperation doesn't exist in target module
 *
 * この失敗は `next build` のコンパイル段階まで出てこないうえ、メッセージから
 * overrides に辿り着くのが難しい。しかも overrides は Dependabot の管理対象外
 * （`ox` は直接依存ではないのでグループに入らない）なので、viem が上がるたびに
 * 人間が手で追従させない限り再発する。それをここで機械的に止める。
 *
 * 不変条件: 解決後の ox >= viem が宣言する ox。
 * 上回るのは許す（ox は 0.14.x 内で概ね上位互換であり、実際に 0.14.44 で
 * viem 2.54.6 / 2.56.3 の両方が通ることを確認している）。下回るのを禁じる。
 *
 * ponytail: 比較は素朴な `x.y.z` の数値比較のみ。prerelease タグ
 * （`1.2.3-beta.1`）やレンジ指定（`^1.2.3`）は扱わない。viem の ox 依存は
 * 完全一致 pin なので今はこれで足りる。将来 viem がレンジで宣言し始めたら
 * `semver` パッケージに差し替える（インストール済みの推移的依存にある）。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** `0.14.30` → `[0, 14, 30]`。`^`/`~` は剥がす。解析できなければ null。 */
export function parseVersion(spec) {
  if (typeof spec !== "string") return null;
  const m = /^[\^~]?(\d+)\.(\d+)\.(\d+)$/.exec(spec.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** a < b なら負、a === b なら 0、a > b なら正。 */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * 検査本体。lockfile の中身を受け取り、問題があればメッセージ配列を返す。
 * ファイル読み込みから切り離してあるのはテストから呼べるようにするため。
 */
export function findOxOverrideProblems(lock, overrides) {
  const packages = lock?.packages ?? {};
  const resolvedSpec = packages["node_modules/ox"]?.version;
  const overrideSpec = overrides?.ox;

  // overrides に ox が無いなら、この検査の前提そのものが無い。何もしない。
  if (overrideSpec == null) return [];

  const resolved = parseVersion(resolvedSpec);
  if (!resolved) {
    return [`lockfile の node_modules/ox の version を解析できない: ${resolvedSpec}`];
  }

  const override = parseVersion(overrideSpec);
  if (!override) {
    return [`package.json の overrides.ox を解析できない: ${overrideSpec}`];
  }

  const problems = [];

  // overrides が実際に効いているか（効いていなければ検査の意味が無い）
  if (compareVersions(override, resolved) !== 0) {
    problems.push(
      `overrides.ox（${overrideSpec}）と lockfile の ox（${resolvedSpec}）が食い違う。` +
        `npm install でロックファイルを作り直すこと。`,
    );
  }

  // 本題: ox を要求する全パッケージの pin を下回っていないか。
  // viem 以外にも ox を完全一致で pin するパッケージが増えうるので、
  // 特定の名前を決め打ちせず lockfile 全体を走査する。
  for (const [path, meta] of Object.entries(packages)) {
    const want = meta?.dependencies?.ox;
    if (want == null) continue;
    const wanted = parseVersion(want);
    if (!wanted) continue; // レンジ指定は ponytail の対象外
    if (compareVersions(resolved, wanted) < 0) {
      const name = path.replace(/^node_modules\//, "") || path;
      problems.push(
        `${name}@${meta.version ?? "?"} は ox@${want} を要求しているが、` +
          `解決後の ox は ${resolvedSpec} で古い。` +
          `package.json の overrides.ox を ${want} 以上に上げること。` +
          `（下回ると next build が「Export ... doesn't exist in target module」で落ちる）`,
      );
    }
  }

  return problems;
}

function main() {
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const problems = findOxOverrideProblems(lock, pkg.overrides);

  if (problems.length > 0) {
    console.error("check-ox-override: NG");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const resolved = lock.packages?.["node_modules/ox"]?.version;
  const wanters = Object.entries(lock.packages ?? {}).filter(
    ([, m]) => m?.dependencies?.ox != null,
  );
  console.log(
    `check-ox-override: OK（解決後の ox ${resolved} / ox を要求するパッケージ ${wanters.length} 件を検査）`,
  );
}

// 直接実行されたときだけ走らせる（テストから import しても main は動かない）
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
