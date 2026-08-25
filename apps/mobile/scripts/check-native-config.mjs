// ネイティブ依存が要求する minSdk と、プロジェクトの minSdk の整合を検査する。
//
// 動機: @stripe/stripe-terminal-react-native が minSdkVersion 26 を要求しているのに
// app.json 側が Expo デフォルト(24)のままで、Android の eas build が manifest merger で
// 2 回落ちた。1 回あたり 12〜17 分。同じ事故を PR の段階で数秒で拾う。
//
// 実行: node scripts/check-native-config.mjs  （npm run check:native）
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// 「minSdk / minSdkVersion のあとに整数リテラルが *直接* 来る」宣言だけを拾う。
// この「直接」が肝。node_modules の大半は
//   minSdkVersion safeExtGet('minSdkVersion', 24)
// の形で、これは「プロジェクト設定に従う。無ければ 24」であってモジュール固有の要求ではない。
// キーの直後に数字を要求すれば、この形は自然に外れる（次の文字が空白＋識別子なので）。
const MIN_SDK_RE = /\bminSdk(?:Version)?\b\s*(?:=|\()?\s*(\d+)/g;

/**
 * build.gradle のテキストから、宣言された minSdk を1つ取り出す。
 * 宣言が無ければ null（＝プロジェクトの設定に従うモジュール）。
 * 複数あれば最大値を採る（flavor 別指定などを取りこぼさないため）。
 *
 * .gradle（// コメント）と .properties（# コメント）の両方を食わせるので、どちらも落とす。
 *
 * ponytail: 行コメントは落とすが、ブロックコメントの中は見ていない。
 * 現在の依存では誤検知ゼロ（検証済み）。誤検知が出たら行単位のパースをやめて
 * 簡易トークナイザに差し替える。
 */
export function parseDeclaredMinSdk(gradleText) {
  let max = null;
  for (const rawLine of gradleText.split("\n")) {
    const line = rawLine.split("//")[0].split("#")[0];
    for (const match of line.matchAll(MIN_SDK_RE)) {
      const value = Number(match[1]);
      if (max === null || value > max) max = value;
    }
  }
  return max;
}

/** プロジェクトの minSdk では足りないモジュールを返す。 */
export function findBlockers(projectMinSdk, modules) {
  return modules.filter((m) => m.minSdk !== null && m.minSdk > projectMinSdk);
}

/** node_modules を掘って android/build.gradle を持つパッケージを列挙する。 */
function collectNativeModules(nodeModulesDir) {
  const found = [];
  const visit = (dir, scope) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // ponytail: シンボリックリンク（npm link / workspace）は辿らない。循環を避けるため。
      // npm ci が作る実ディレクトリだけを見れば CI の目的は満たせる。
      if (!entry.isDirectory() || entry.name === ".bin") continue;
      const pkgDir = join(dir, entry.name);
      if (entry.name.startsWith("@")) {
        visit(pkgDir, `${entry.name}/`);
        continue;
      }
      const gradle = join(pkgDir, "android", "build.gradle");
      if (existsSync(gradle)) {
        found.push({
          name: scope + entry.name,
          minSdk: parseDeclaredMinSdk(readFileSync(gradle, "utf8")),
        });
      }
      const nested = join(pkgDir, "node_modules");
      if (existsSync(nested)) visit(nested, "");
    }
  };
  visit(nodeModulesDir, "");
  return found;
}

/**
 * expo-modules-core が使う minSdk のデフォルト値を取り出す。
 * `safeExtGet("minSdkVersion", 24)` の 24 の側。無ければ null。
 *
 * parseDeclaredMinSdk はこの形を意図的に無視する（モジュールの要求ではないため）ので、
 * 「Expo の既定値はいくつか」を聞く専用の関数として分けてある。
 * 数値をこのスクリプトに直書きしないのが目的。SDK 更新で既定値が動いても追従する。
 */
export function parseExpoDefaultMinSdk(pluginGradleText) {
  const match = pluginGradleText.match(
    /safeExtGet\(\s*["']minSdkVersion["']\s*,\s*(\d+)\s*\)/,
  );
  return match ? Number(match[1]) : null;
}

/** プロジェクトの minSdk を決める。決められなければ null。 */
function resolveProjectMinSdk(root) {
  // 1. prebuild が生成した android/gradle.properties が本命。EAS が実際に使う値。
  //    SDK 55 では build.gradle ではなくここに android.minSdkVersion=NN として出る。
  const generated = join(root, "android", "gradle.properties");
  if (existsSync(generated)) {
    const value = parseDeclaredMinSdk(readFileSync(generated, "utf8"));
    if (value !== null) return { value, source: "android/gradle.properties" };
  }
  // 2. prebuild していない環境では app.json の expo-build-properties を読む。
  const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
  for (const plugin of appJson.expo?.plugins ?? []) {
    if (Array.isArray(plugin) && plugin[0] === "expo-build-properties") {
      const value = plugin[1]?.android?.minSdkVersion;
      if (typeof value === "number") return { value, source: "app.json" };
    }
  }
  // 3. どちらにも設定が無い＝Expo の既定値がそのまま使われる。
  //    まさにこの状態で今回の事故が起きたので、ここを黙って諦めると検査の意味が無い。
  const pluginGradle = join(
    root,
    "node_modules",
    "expo-modules-core",
    "android",
    "ExpoModulesCorePlugin.gradle",
  );
  if (existsSync(pluginGradle)) {
    const value = parseExpoDefaultMinSdk(readFileSync(pluginGradle, "utf8"));
    if (value !== null) return { value, source: "expo-modules-core の既定値" };
  }
  return null;
}

function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const project = resolveProjectMinSdk(root);

  if (!project) {
    // Expo のデフォルト値をここに直書きしない（SDK 更新で動くため）。
    // 値が確定できない状態は「通す」より「止める」方が安全なので落とす。
    console.error(
      "プロジェクトの minSdk を特定できませんでした。\n" +
        "  app.json の expo-build-properties に android.minSdkVersion を明示してください。",
    );
    process.exit(1);
  }

  const modules = collectNativeModules(join(root, "node_modules"));
  const blockers = findBlockers(project.value, modules);

  if (blockers.length > 0) {
    const required = Math.max(...blockers.map((m) => m.minSdk));
    console.error(
      `minSdk 不足: プロジェクトは ${project.value}（${project.source}）ですが、` +
        `以下のモジュールはそれより上を要求します。\n` +
        blockers.map((m) => `  - ${m.name}: minSdk ${m.minSdk}`).join("\n") +
        `\n\n対処: app.json の expo-build-properties.android.minSdkVersion を ` +
        `${required} 以上にしてください。\n` +
        `放置すると Android ビルドが manifest merger で落ちます` +
        `（uses-sdk:minSdkVersion ... cannot be smaller than version ${required}）。`,
    );
    process.exit(1);
  }

  const declared = modules.filter((m) => m.minSdk !== null);
  console.log(
    `minSdk OK: プロジェクト ${project.value}（${project.source}）。` +
      `ネイティブモジュール ${modules.length} 件を検査、うち ${declared.length} 件が明示宣言` +
      (declared.length > 0
        ? `（最大 ${Math.max(...declared.map((m) => m.minSdk))}）`
        : "") +
      "。",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
