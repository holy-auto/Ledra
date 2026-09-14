// Expo SDK が固定している依存が、dependabot.yml の ignore に漏れなく載っているかの検査。
//
// なぜ要るか（2026-09-14・DECISION_LOG 参照）:
// Expo は bundledNativeModules.json で react-native などのバージョンを固定する。
// これらを Dependabot が単独で上げると Expo のツールチェーンが壊れるため、
// minor バンプを ignore している。問題はその一覧が **手書き** であること。
// Expo 依存を1つ足して ignore に書き忘れると、次の週に Dependabot が
// その1つだけ Expo の指定を追い越す PR を作り、しかも誰も気づかない。
//
// 実際 #1046 では react-native / worklets / reanimated の3つに目が行き、
// gesture-handler / screens / safe-area-context が同じ問題を抱えたまま
// 見落とされかけた（兄弟実装を揃えていない = MISTAKE_LEDGER 型 J）。
// 「3つ除外」ではなく「Expo が固定しているもの全部」が正しい単位である。
//
// ここは実データ同士を突き合わせる: node_modules/expo の
// bundledNativeModules.json（Expo 本人の主張）× package.json の直接依存
// × dependabot.yml の ignore。推測は挟まない。
//
// 実行: node apps/mobile/scripts/check-expo-pins.check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, "..");
const repoRoot = join(mobileRoot, "..", "..");

const bundledPath = join(mobileRoot, "node_modules", "expo", "bundledNativeModules.json");

// expo が入っていない環境（ルートだけの CI ジョブなど）では検査しようがない。
// ここで落とすと「入っていないから緑」という無意味な緑になるので、
// **スキップではなく明示的に何もしないと言う**。mobile の npm test は
// npm ci の後に走るので、実運用ではこの分岐には入らない。
if (!existsSync(bundledPath)) {
  console.log("check-expo-pins: skipped（node_modules/expo が無い。mobile で npm ci 後に実行すること）");
  process.exit(0);
}

const bundled = JSON.parse(readFileSync(bundledPath, "utf8"));
const pkg = JSON.parse(readFileSync(join(mobileRoot, "package.json"), "utf8"));
const directDeps = { ...pkg.dependencies, ...pkg.devDependencies };

// dependabot.yml から /apps/mobile ブロックの「minor を無視する名前」を拾う。
// ponytail: YAML パーサを足さず正規表現で読む。この設定ファイルの形は単純で
// （dependency-name と update-types が固定の順で並ぶ）、依存を1つ増やすより安い。
// 形が崩れたら拾えず検査が緩むが、その場合は下の assert が落ちて気づける。
const yml = readFileSync(join(repoRoot, ".github", "dependabot.yml"), "utf8");
const mobileBlock = yml.slice(yml.indexOf('directory: "/apps/mobile"'));
const ignoredMinor = [
  ...mobileBlock.matchAll(
    /dependency-name:\s*"([^"]+)"\s*\n\s*update-types:\s*\[\s*"version-update:semver-minor"\s*\]/g,
  ),
].map((m) => m[1]);

assert.ok(
  ignoredMinor.length > 0,
  "dependabot.yml の /apps/mobile から semver-minor の ignore を1件も読めなかった（設定の形が変わった可能性）",
);

/** `expo-*` のようなワイルドカードを含む dependency-name に name が当たるか。 */
function covers(pattern, name) {
  if (!pattern.includes("*")) return pattern === name;
  const rx = new RegExp(`^${pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
  return rx.test(name);
}

// Expo が固定していて、かつ直接依存しているものは、すべて ignore 対象であること。
const pinnedDirect = Object.keys(bundled).filter((name) => name in directDeps);
const uncovered = pinnedDirect.filter((name) => !ignoredMinor.some((p) => covers(p, name)));

assert.deepEqual(
  uncovered,
  [],
  `Expo が bundledNativeModules.json で固定しているのに dependabot.yml の ignore に無い依存がある: ` +
    `${uncovered.join(", ")}\n` +
    `  → .github/dependabot.yml の /apps/mobile ブロックに次を足すこと:\n` +
    uncovered.map((n) => `      - dependency-name: "${n}"\n        update-types: ["version-update:semver-minor"]`).join("\n"),
);

console.log(
  `check-expo-pins: OK（Expo 固定の直接依存 ${pinnedDirect.length} 件すべてが ignore 対象 / ignore 規則 ${ignoredMinor.length} 件）`,
);
