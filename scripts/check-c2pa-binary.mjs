#!/usr/bin/env node
/**
 * `C2PA_MODE=production` のビルドでだけ、`@contentauth/c2pa-node` の**ネイティブバイナリを
 * 実際にロードできる**ことを要求する。できなければビルドを落とす。
 *
 * ## なぜ要るか
 *
 * このパッケージは `optionalDependencies` にあり、ネイティブバイナリ（約 48MB の
 * `dist/index.node`）は npm tarball に入っていない。`postinstall`
 * （`scripts/postinstall.cjs`）が
 *
 *   1. GitHub Releases からプラットフォーム別のプリビルドを DL する
 *   2. 失敗したら Rust でビルドする（`rustc` / `cargo` が要る）
 *
 * の順に試す。**どちらも駄目だったとき、スクリプトは警告を出して exit 0 で終わる**
 * （2026-10-07 に実測。`Skipping Rust build since Rust and/or Cargo is not found` を
 * 出して成功扱い）。つまり:
 *
 * - `optionalDependencies` → `dependencies` に移しても**この沈黙は直らない**。
 *   npm が許すのは「失敗したインストール」で、このスクリプトは失敗しないため。
 * - Vercel のビルド環境に Rust は無いので、DL が失敗したら**バイナリ無しのまま
 *   デプロイが成功する**。
 *
 * そして #1209 以降、`C2PA_MODE=production` で署名器が作れないと `uploadHandler` が
 * 入口で全アップロードを 503 で断る。黙ってデプロイが通ると**写真が1枚も保存できない
 * 本番**が出来上がる。それを顧客に見つけてもらうのではなく、ビルドで止める。
 *
 * ## なぜ `import()` では駄目か（実測 2026-10-07）
 *
 * 最初は `await import("@contentauth/c2pa-node")` して `Builder`/`Reader` が関数かを
 * 見ていた。**バイナリを消しても通った。** `dist/binary.js` の `getNeonBinary()` は
 * **初回アクセス時に遅延ロード**する作りで、import と型の確認だけではネイティブを
 * 一度も踏まない。そこでこのスクリプトは `binary.js` と同じ
 * `require(C2PA_LIBRARY_PATH ?? "./index.node")` を自分で実行する。
 * パッケージ内部の API（`getNeonBinary`）に依存せず、同じ1行を再現する形にしてある。
 *
 * ## 天井（ponytail）
 *
 1. `C2PA_MODE` が**ビルド時に見えること**が前提。`.env` 系は上で読むが、Vercel で
 *    実行時専用の env として設定されている場合は発火しない。その場合でも実行時の
 *    先行検査（#1209）が 503 で止めるので「黙って未署名」には戻らないが、気づくのは
 *    デプロイ後になる。確実にしたいなら Vercel の env を Build にも露出させる。
 2. **見ているのは「ビルド機でロードできるか」であって、「本番の関数にバイナリが入るか」
 *    ではない。** `next.config.ts` の `serverExternalPackages` に入れてあるので、48MB の
 *    `dist/index.node` は output file tracing 経由でしか関数バンドルに入らない。
 *    DL は成功（この検査は緑）なのに tracing が拾わなかった場合、実行時は
 *    `signer_unavailable` になり #1209 のゲートが全件 503 にする —— **この検査では防げない。**
 *    塞ぐならビルド後に `.next/` 配下の実在を見るか、デプロイ後のスモークが要る。
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
// `@next/env` は CJS なので named import できない（default 経由）。
import nextEnv from "@next/env";

// **`.env` 系も読む。** 運用手順書（`docs/c2pa-production-deployment.md` §3）は
// 「`.env` に `C2PA_MODE=production` を設定」と書いている。`next build` は env ファイルを
// 読むが素の `node` は読まないので、process.env だけ見ていると**手順書どおりに設定した人の
// ところで検査が黙ってスキップする**（/code-review 指摘）。next と同じ読み方に揃える。
nextEnv.loadEnvConfig(process.cwd(), /* dev */ false, { info: () => {}, error: console.error });

const mode = process.env.C2PA_MODE;

if (mode !== "production") {
  console.log(`[check:c2pa-binary] skip — C2PA_MODE=${mode ?? "(未設定)"}（production のときだけ検査する）`);
  process.exit(0);
}

const require = createRequire(import.meta.url);

function fail(reason, detail) {
  console.error(
    [
      "",
      `::error::[check:c2pa-binary] C2PA_MODE=production なのに C2PA のネイティブバイナリを使えません: ${reason}`,
      "",
      "このままデプロイすると、写真アップロードが**全件 503** で断られます",
      "（C2PA_MODE=production で署名器が作れないとき、入口で全体を断る設計: PR #1209）。",
      "",
      "原因の候補:",
      "  1. postinstall のプリビルド DL が失敗した（ネットワーク、またはこのバージョンの",
      "     リリース資産が無い）。ビルドログに `Downloading |` が出ていなければ DL していない。",
      "  2. DL 失敗後の Rust ビルドも走っていない（ビルド環境に rustc/cargo が無い）。",
      "     ビルドログの `Skipping Rust build since Rust and/or Cargo is not found` が目印。",
      "  3. optionalDependencies なので npm ci は成功してしまう（区分を変えても直らない:",
      "     postinstall 自体が exit 0 で終わるため）。",
      "  4. バイナリはあるが別プラットフォーム向け、または共有ライブラリが足りない",
      "     （glibc / libstdc++）。その場合は下の例外にリンカのエラーが出る。",
      "",
      "対処: node_modules/@contentauth/c2pa-node/dist/index.node の実在とアーキテクチャを確認し、",
      "無ければプリビルドの取得経路（GitHub Releases への到達可否）を直す。",
      "どうしても用意できない間は C2PA_MODE を production 以外にしてデプロイすること",
      "（署名はされないが、写真は保存できる）。",
      "",
      detail ?? "",
    ].join("\n"),
  );
  process.exit(1);
}

// パッケージの dist/ を解決する。`binary.js` は `require("./index.node")` を
// *その* ディレクトリ基準で解くので、同じ基準を使う。
let distDir;
try {
  distDir = path.dirname(fileURLToPath(import.meta.resolve("@contentauth/c2pa-node")));
} catch (err) {
  fail(
    "パッケージ自体を解決できない（インストールされていない）",
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
}

// `dist/binary.js` と同じ読み込み。`C2PA_LIBRARY_PATH` の上書きも尊重する。
// **相対パスは `dist/` 基準で解く。** あちらの `require` は `dist/binary.js` から呼ばれるので
// 相対の基準が `dist/` になる。ここで `scripts/` 基準のまま解くと、パッケージは読めるのに
// この検査だけが落ちて**ビルドが通らなくなる**（/code-review 指摘。`C2PA_LIBRARY_PATH=./index.node`
// で実際に再現した）。絶対パスはそのまま使う。
const override = process.env.C2PA_LIBRARY_PATH;
const target = override ? path.resolve(distDir, override) : path.join(distDir, "index.node");

try {
  const neon = require(target);
  // **ロードが例外を投げなかったこと自体が、欲しい信号のほぼ全部である。**
  // 関数の本数は参考情報として出すだけで、0 本でも落とさない —— napi/neon の
  // モジュールは `module.exports` が関数のこともあり、メンバが非列挙の getter の
  // こともある。数を条件にすると**正常なバイナリでビルドを殺す**（/code-review 指摘）。
  const shape =
    typeof neon === "function"
      ? "関数 export"
      : `ネイティブ関数 ${Object.keys(neon ?? {}).filter((k) => typeof neon[k] === "function").length} 個`;
  if (neon === null || neon === undefined) {
    fail(`${target} をロードできたが export が空（壊れたバイナリの疑い）`);
  }
  console.log(
    `[check:c2pa-binary] OK — ${path.relative(process.cwd(), target) || target} をロードした（${shape}）`,
  );
} catch (err) {
  fail(
    `${target} をロードできない`,
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
}
