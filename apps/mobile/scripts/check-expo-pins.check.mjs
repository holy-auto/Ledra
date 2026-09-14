// Expo SDK が固定している依存が、dependabot.yml の ignore に過不足なく載っているかの検査。
//
// なぜ要るか（2026-09-14・DECISION_LOG 参照）:
// Expo は bundledNativeModules.json で react-native などのバージョンを固定する。
// これらを Dependabot が単独で上げると Expo のツールチェーンが壊れるため、
// minor バンプを ignore している。問題はその一覧が **手書き** であること。
// Expo 依存を1つ足して ignore に書き忘れると、次の週に Dependabot が
// その1つだけ Expo の指定を追い越す PR を作り、しかも誰も気づかない。
//
// 検査は双方向である。片方向だと DECISION_LOG が退けた選択肢を止められない。
//   - 不足: Expo が固定しているのに ignore に無い → 黙って追い越される
//   - 過剰: Expo が固定していないのに ignore に載っている → 黙って更新が止まる
//     （`react-native-*` のワイルドカード案がこれ。nfc-manager / paper /
//      qrcode-svg / url-polyfill / vector-icons の5つを巻き添えにする）
//
// **この検査は名前の集合しか見ない。バージョンは見ない。**
// Expo の完全一致 pin（react-native 0.83.10 等）に対して patch バンプは
// ignore を素通りするので、指定を追い越した状態は別途起こりうる。
// バージョン単位で揃えたいときは `npx expo install --check` を使う
// （OPEN_QUESTIONS 参照）。ここが保証するのは「一覧に漏れと余りが無いこと」だけ。
//
// 実行: node apps/mobile/scripts/check-expo-pins.check.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(here, "..");
const repoRoot = join(mobileRoot, "..", "..");

const expoRoot = join(mobileRoot, "node_modules", "expo");
const bundledPath = join(expoRoot, "bundledNativeModules.json");

// node_modules が無い環境では検査できない。**ここで exit 0 すると
// 「入っていないから緑」という無意味な緑になる**ので落とす。
// mobile の npm test は npm ci の後に走るため、実運用では通らない分岐。
assert.ok(
  existsSync(bundledPath),
  `node_modules/expo/bundledNativeModules.json が無い。apps/mobile で npm ci を実行してから再実行すること（見つからない場合に緑を返すと検査が沈黙するので失敗させている）`,
);

const expoVersion = JSON.parse(readFileSync(join(expoRoot, "package.json"), "utf8")).version;
const bundled = JSON.parse(readFileSync(bundledPath, "utf8"));
const pkg = JSON.parse(readFileSync(join(mobileRoot, "package.json"), "utf8"));
const directDeps = { ...pkg.dependencies, ...pkg.devDependencies };

// Expo SDK 本体は bundledNativeModules.json に自分を載せないが、
// minor が上がれば固定値が総入れ替えになるので ignore が要る。
// 実データから導けない唯一の項目なのでここに明示する。
const REQUIRED_NOT_IN_BUNDLED = ["expo"];

// dependabot.yml の /apps/mobile ブロックだけを切り出す。
// **末尾を次の package-ecosystem で止めること。** 止めないと後続ブロック
// （github-actions 等）の ignore まで数えてしまい、npm の依存を守っていない
// のに緑になる。
const yml = readFileSync(join(repoRoot, ".github", "dependabot.yml"), "utf8");
const anchor = yml.indexOf('directory: "/apps/mobile"');
assert.notEqual(
  anchor,
  -1,
  'dependabot.yml に `directory: "/apps/mobile"` が見つからない（設定の書き方が変わった可能性。directories 形式や引用符の変更を疑うこと）',
);
const after = yml.slice(anchor);
const nextBlock = after.search(/\n\s*-\s*package-ecosystem:/);
const mobileBlock = nextBlock === -1 ? after : after.slice(0, nextBlock);

// update-types の配列の **どこかに** semver-minor があればよい。
// 完全一致にすると、patch も足して保護を強めたときに落ちてしまう。
const ignoredMinor = [
  ...mobileBlock.matchAll(/dependency-name:\s*"([^"]+)"\s*\n\s*update-types:\s*\[([^\]]*)\]/g),
]
  .filter(([, , types]) => types.includes("version-update:semver-minor"))
  .map(([, name]) => name);

assert.ok(
  ignoredMinor.length > 0,
  "dependabot.yml の /apps/mobile から semver-minor の ignore を1件も読めなかった（設定の形が変わった可能性）",
);

/** `expo-*` のようなワイルドカードを含む dependency-name に name が当たるか。 */
function covers(pattern, name) {
  if (!pattern.includes("*")) return pattern === name;
  const rx = new RegExp(
    `^${pattern
      .split("*")
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  return rx.test(name);
}

const shouldBeIgnored = new Set([
  ...Object.keys(bundled).filter((name) => name in directDeps),
  ...REQUIRED_NOT_IN_BUNDLED.filter((name) => name in directDeps),
]);

// 不足: Expo が固定しているのに ignore に無い。
const uncovered = [...shouldBeIgnored].filter((name) => !ignoredMinor.some((p) => covers(p, name)));
assert.deepEqual(
  uncovered,
  [],
  `expo@${expoVersion} が固定しているのに dependabot.yml の ignore に無い依存がある: ${uncovered.join(", ")}\n` +
    `  → .github/dependabot.yml の /apps/mobile ブロックに次を足すこと:\n` +
    uncovered
      .map((n) => `      - dependency-name: "${n}"\n        update-types: ["version-update:semver-minor"]`)
      .join("\n"),
);

// 過剰: Expo が固定していない直接依存まで ignore が巻き込んでいる。
// ワイルドカードを広げすぎたときにここで落ちる。
const overreach = Object.keys(directDeps).filter(
  (name) => !shouldBeIgnored.has(name) && ignoredMinor.some((p) => covers(p, name)),
);
assert.deepEqual(
  overreach,
  [],
  `expo@${expoVersion} が固定していないのに ignore に巻き込まれている直接依存がある: ${overreach.join(", ")}\n` +
    `  → これらの minor 更新が黙って止まる。dependabot.yml のワイルドカードを狭めること。`,
);

console.log(
  `check-expo-pins: OK（expo@${expoVersion} 基準 / 固定の直接依存 ${shouldBeIgnored.size} 件が過不足なく ignore 対象 / ignore 規則 ${ignoredMinor.length} 件）`,
);
