// check-native-config の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/scripts/check-native-config.check.mjs
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectResourceRefs,
  findBlockers,
  findMissingRefs,
  parseDeclaredMinSdk,
  parseExpoDefaultMinSdk,
} from "./check-native-config.mjs";

// --- 実際の依存に現れる書き方を拾えること ---
// @stripe/stripe-terminal-react-native/android/build.gradle:43 の実物
assert.equal(parseDeclaredMinSdk("    defaultConfig {\n        minSdkVersion 26\n    }"), 26);
assert.equal(parseDeclaredMinSdk("minSdk = 26"), 26);
assert.equal(parseDeclaredMinSdk("minSdkVersion(26)"), 26);
assert.equal(parseDeclaredMinSdk("minSdkVersion = 26"), 26);

// prebuild が生成する android/gradle.properties の形（SDK 55 はここに出す）
assert.equal(parseDeclaredMinSdk("android.minSdkVersion=26"), 26);

// --- 宣言が無ければ null（プロジェクト設定に従うモジュール） ---
assert.equal(parseDeclaredMinSdk("android { compileSdkVersion 36 }"), null);

// --- safeExtGet 系は「モジュールの要求」ではないので拾わない ---
// これが本体。node_modules の大半はこの形で、拾ってしまうと
// react-native-nfc-manager が「16 を要求」に見えるなど意味が壊れる。
const SAFE_EXT_GET = [
  "        minSdkVersion safeExtGet('minSdkVersion', 24)", // react-native-gesture-handler
  '        minSdkVersion safeExtGet("minSdkVersion", 23)', // react-native-reanimated
  "        minSdkVersion getExtOrDefault('minSdkVersion', 16)", // react-native-safe-area-context
  "        minSdkVersion safeExtGet(['minSdkVersion', 'minSdk'], rnsDefaultMinSdkVersion)", // react-native-screens
  "        minSdkVersion getExtOrIntegerDefault('minSdkVersion')", // @react-native-community/netinfo
];
for (const line of SAFE_EXT_GET) {
  assert.equal(parseDeclaredMinSdk(line), null, `拾ってはいけない: ${line}`);
}

// --- コメント行は拾わない（誤検知で CI を止めないため） ---
const COMMENTED = "// minSdkVersion 99\nandroid { }";
assert.equal(parseDeclaredMinSdk(COMMENTED), null);
assert.equal(parseDeclaredMinSdk("minSdkVersion 26 // was minSdkVersion 99"), 26);
// .properties 側は # がコメント
assert.equal(parseDeclaredMinSdk("# android.minSdkVersion=99"), null);

// --- 複数宣言があれば最大値（flavor 別指定を取りこぼさない） ---
assert.equal(parseDeclaredMinSdk("minSdkVersion 21\nminSdkVersion 26\nminSdkVersion 23"), 26);

// --- findBlockers ---
const mods = [
  { name: "@stripe/stripe-terminal-react-native", minSdk: 26 },
  { name: "react-native-svg", minSdk: null },
];
assert.deepEqual(findBlockers(26, mods), []); // 境界: 要求 === プロジェクト は通す
assert.deepEqual(findBlockers(27, mods), []);
assert.deepEqual(findBlockers(24, mods), [
  { name: "@stripe/stripe-terminal-react-native", minSdk: 26 },
]);
// 宣言なし(null)は比較の対象外。null > n の暗黙 0 扱いで誤判定しないこと。
assert.deepEqual(findBlockers(1, [{ name: "x", minSdk: null }]), []);

// --- parseExpoDefaultMinSdk: 既定値を直書きせず expo-modules-core から読む ---
// ExpoModulesCorePlugin.gradle:68 の実物
assert.equal(
  parseExpoDefaultMinSdk('      minSdkVersion project.ext.safeExtGet("minSdkVersion", 24)'),
  24,
);
assert.equal(parseExpoDefaultMinSdk("safeExtGet('minSdkVersion', 24)"), 24);
// compileSdkVersion の行を取り違えない
assert.equal(parseExpoDefaultMinSdk('safeExtGet("compileSdkVersion", 36)'), null);
assert.equal(parseExpoDefaultMinSdk("android { }"), null);

// --- collectResourceRefs / findMissingRefs ---
// 今回 15 分ビルドして踏んだ styles.xml の行そのもの
const STYLES = `<resources>
  <style name="Theme.App.SplashScreen" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/splashscreen_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/splashscreen_logo</item>
    <item name="postSplashScreenTheme">@style/AppTheme</item>
  </style>
</resources>`;
// drawable は拾い、@color と @style は拾わない（AAR 側が持ちうるので誤検知の元）。
// 名前空間は残す。欠落の報告で AAPT2 と同じ文字列を出すため。
assert.deepEqual(collectResourceRefs(STYLES), ["drawable/splashscreen_logo"]);
assert.deepEqual(collectResourceRefs("<item>@mipmap/ic_launcher</item>"), [
  "mipmap/ic_launcher",
]);
assert.deepEqual(collectResourceRefs("<resources/>"), []);
// @android:color/transparent のような framework 参照は拾わない
assert.deepEqual(collectResourceRefs('<item>@android:color/transparent</item>'), []);
// 同じ参照が複数あっても1件
assert.deepEqual(collectResourceRefs("@drawable/a @drawable/a @drawable/b"), [
  "drawable/a",
  "drawable/b",
]);

// 実体は拡張子を落とした名前で照合する（png でも xml でも同じ名前）
assert.deepEqual(findMissingRefs(["drawable/splashscreen_logo"], ["splashscreen_logo"]), []);
assert.deepEqual(findMissingRefs(["drawable/splashscreen_logo"], ["ic_launcher"]), [
  "drawable/splashscreen_logo",
]);
assert.deepEqual(findMissingRefs([], ["ic_launcher"]), []);
// 名前空間が違っても実体名で照合する（mipmap/ic_launcher は ic_launcher.xml で満たされる）
assert.deepEqual(findMissingRefs(["mipmap/ic_launcher"], ["ic_launcher"]), []);

// --- 変異テスト ---
// 上の2つの契約（コメント無視・safeExtGet 無視）が「たまたま通っている」だけでないことを
// 確かめる。素朴に書くとこうなる、という実装を用意し、契約が実際に破れることを見る。
// 破れなければアサーションが何も守っていない。
const NAIVE_RE = /\bminSdk(?:Version)?\b\D*(\d+)/g; // 「キーの後の最初の数字」を拾う版
const naive = (text) => {
  const hits = [...text.matchAll(NAIVE_RE)].map((m) => Number(m[1]));
  return hits.length > 0 ? Math.max(...hits) : null;
};
assert.equal(naive(COMMENTED), 99, "コメント除去が無ければ 99 を拾ってしまうはず");
assert.equal(
  naive("        minSdkVersion safeExtGet('minSdkVersion', 24)"),
  24,
  "「直後の数字」制約が無ければ safeExtGet のデフォルト値を拾ってしまうはず",
);

// 参照集めから @drawable を外すと、今回の事故（splashscreen_logo の欠落）を見逃す。
const colorOnly = (text) => [
  ...new Set([...text.matchAll(/@(color\/[A-Za-z0-9_]+)/g)].map((m) => m[1])),
];
assert.deepEqual(
  findMissingRefs(colorOnly(STYLES), []),
  ["color/splashscreen_background"],
  "@drawable を見ない実装は splashscreen_logo を取りこぼすはず",
);
assert.ok(
  !findMissingRefs(colorOnly(STYLES), []).includes("drawable/splashscreen_logo"),
  "取りこぼしていることの確認",
);

// ナインパッチの拡張子除去。bg.9.png のリソース名は bg なので、
// `.9` を落とさない実装だと @drawable/bg が「実体なし」と誤検知になる。
const stripExt = (file) => file.replace(/(\.9)?\.[^.]+$/, "");
assert.equal(stripExt("bg_button.9.png"), "bg_button");
assert.equal(stripExt("splashscreen_logo.png"), "splashscreen_logo");
assert.equal(stripExt("ic_launcher.xml"), "ic_launcher");
assert.deepEqual(findMissingRefs(["drawable/bg_button"], [stripExt("bg_button.9.png")]), []);
// 変異: `.9` を落とさないと誤検知する
const naiveStrip = (file) => file.replace(/\.[^.]+$/, "");
assert.deepEqual(
  findMissingRefs(["drawable/bg_button"], [naiveStrip("bg_button.9.png")]),
  ["drawable/bg_button"],
  "`.9` を落とさない実装はナインパッチを誤検知するはず",
);

// --- スモークテスト: 実際に起動して検査が走ることを確認する ---
// 純粋関数のテストは、エントリポイントのガード（import.meta.main）が壊れて
// main() が呼ばれなくなっても全部通ってしまう。その場合スクリプトは
// 「無出力で exit 0」になり、CI は緑のまま何も検査しない。ここで実際に起動して塞ぐ。
const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "check-native-config.mjs");
const output = execFileSync(process.execPath, [scriptPath], { encoding: "utf8" });
assert.match(
  output,
  /minSdk OK: プロジェクト \d+/,
  `起動しても検査が走っていない（ガードが壊れている可能性）。出力: ${JSON.stringify(output)}`,
);

console.log("check-native-config: ok");
