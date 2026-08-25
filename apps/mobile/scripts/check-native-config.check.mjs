// check-native-config の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/scripts/check-native-config.check.mjs
import assert from "node:assert";

import {
  findBlockers,
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

console.log("check-native-config: ok");
