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
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * `C2PA_MODE` を解決する。**`.env` 系も見る。**
 *
 * 運用手順書（`docs/c2pa-production-deployment.md` §3）は「`.env` に `C2PA_MODE=production`」と
 * 書いている。`next build` は env ファイルを読むが素の `node` は読まないので、`process.env` だけ
 * 見ていると**手順書どおりに設定した人のところで検査が黙ってスキップする**。
 *
 * ## 自前パーサをやめた理由（2026-10-08）
 *
 * ここは一度**自前で1行1つの `KEY=VALUE` を読む**作りにしていた。`@next/env` が
 * この repo の宣言外の依存（`next` の推移的依存）だったのを避けるためである。
 * **3件とも parity を外した**（`/code-review` が実測）:
 *
 * - `.env.example` は `C2PA_MODE=disabled` を含む。手順書どおり末尾に `C2PA_MODE=production` を
 *   足すと、**dotenv は後の行を採り、自前パーサは先の行を採った** → next は production、検査は skip。
 * - `C2PA_MODE=production # 本番` → dotenv は `production`、自前パーサは `production # 本番` → skip。
 * - `C2PA_MODE="production" # x` → dotenv は `production`、自前パーサは引用符ごと → skip。
 *
 * **3つとも「黙ってスキップ」で、このスクリプトが止めるはずだった事故そのものである。**
 * parity が要件なら、parity を持っている実装を使うのが安い（CLAUDE.md の梯子 5段目）。
 *
 * 宣言外の依存という問題は、**`next` 経由で解決する**ことで消える ——
 * `createRequire(require.resolve("next"))("@next/env")` は *その* `next` が使う `@next/env` を
 * そのまま掴むので、hoisting でも版ズレでも外れない。`next` は package.json にある。
 *
 * 取れない場合（next が無い等）は `process.env` だけで判断し、**その旨を出力に書く**。
 * 黙って判断基準を変えない。
 */
function loadEnvFiles() {
  // **`C2PA_MODE` が実 env にあっても必ず読む。** 早期 return にしていたら、
  // `C2PA_MODE` を実 env で渡し `C2PA_LIBRARY_PATH` を `.env` に書いた構成で
  // **override がこの検査から見えず、next とランタイムだけが拾う**状態になっていた
  // （同じ `.env` が、`C2PA_MODE` の出所だけで exit 0 と exit 1 に分かれた。実測）。
  // しかもそれは上の天井 1 が推奨している構成（env を Build にも露出）そのもの。
  // 実 env の優先は `@next/env` 側が守る（`processEnv` は既に process.env にある値を
  // 上書きしない。実測で確認済みで、下のテストも見張っている）。
  try {
    const viaNext = createRequire(require.resolve("next"));
    // **next の CLI と同じ既定を踏む。** `next/dist/bin/next` は
    // `process.env.NODE_ENV = process.env.NODE_ENV || defaultEnv`（build では "production"）で、
    // **既に設定されていれば尊重する**。そして `@next/env` は `NODE_ENV === "test"` のとき
    // モードを test にし、**`.env.local` を読まない**（`@next/env/dist/index.js` の
    // `d !== "test" && ".env.local"`）。ここで production を強制すると、
    // `NODE_ENV=test` のシェルで走った `next build` とこの検査がずれる。
    process.env.NODE_ENV = process.env.NODE_ENV || "production";
    // dev=false＝`next build`（dev 以外）と同じ。logger は黙らせる
    // （この検査の出力に next の "Environments:" を混ぜない）。
    viaNext("@next/env").loadEnvConfig(process.cwd(), false, { info() {}, error: console.error });
    return `@next/env（next 経由・NODE_ENV=${process.env.NODE_ENV}）`;
  } catch (err) {
    return `process.env のみ —— @next/env を next 経由で取れなかった（${err instanceof Error ? err.message : String(err)}）`;
  }
}

// **`C2PA_MODE` と `C2PA_LIBRARY_PATH` の両方を、同じ土台の上で読む。**
const via = loadEnvFiles();
const mode = process.env.C2PA_MODE;

if (mode !== "production") {
  console.log(
    `[check:c2pa-binary] skip — C2PA_MODE=${mode ?? "(未設定)"}（production のときだけ検査する／出典: ${via}）`,
  );
  process.exit(0);
}



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
  // **`import.meta.resolve` は使わない。** Node の版によって未実装・挙動差があり、ビルドを止める
  // スクリプトが環境差で落ちるのは本末転倒（Vercel のビルド機の Node は固定ではない）。
  // `createRequire().resolve()` はどの Node でも同じ挙動。
  distDir = path.dirname(require.resolve("@contentauth/c2pa-node"));
} catch (err) {
  fail(
    "パッケージ自体を解決できない（インストールされていない）",
    err instanceof Error ? (err.stack ?? err.message) : String(err),
  );
}

// **`dist/binary.js` の1行をそのまま再現する。**
//
// あちらは `createRequire(import.meta.url)` を `dist/binary.js` の位置で作り、
// `require(C2PA_LIBRARY_PATH ?? "./index.node")` を呼ぶだけ。だから**同じ位置に
// `createRequire` を置けば、解決規則は Node が持っている**（CLAUDE.md の梯子3段目）。
//
// ここは自前の分岐で3回直している —— 相対パスの基準、裸の指定子の基準、`??` と真偽値の違い。
// **3つとも「Node の解決を自分で書き直した」ことの副作用**だった（/code-review 指摘・2026-10-09）。
// 自前の分岐では、`node_modules/@contentauth/c2pa-node/node_modules/<name>`（npm が版の衝突で
// 作る入れ子）に置かれた指定子を、パッケージは読めてこの検査だけが落とす差も残っていた。
// `??` を使うので空文字はそのまま渡り、あちらと同じ `ERR_INVALID_ARG_VALUE` で落ちる。
const override = process.env.C2PA_LIBRARY_PATH;
const requirePkg = createRequire(path.join(distDir, "binary.js"));
const target = override ?? "./index.node";

try {
  const neon = requirePkg(target);
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
  // 何を実際に読んだかを出す（`target` は指定子なので、解決後のパスの方が役に立つ）。
  console.log(
    `[check:c2pa-binary] OK — ${requirePkg.resolve(target)} をロードした（${shape}）`,
  );
} catch (err) {
  // **空の override は専用の文言にする。** `${target}` がそのまま空文字になり、
  // 「 をロードできない」という読めない見出し＋見当外れの原因候補4つになっていた
  // （この場合バイナリは健在なので、「dist/index.node の実在を確認」は空振りする。
  //  /code-review 指摘・2026-10-09）。
  fail(
    override === ""
      ? "`C2PA_LIBRARY_PATH` が**空文字**で設定されている（未設定とは違う）。" +
          "パッケージ側は `C2PA_LIBRARY_PATH ?? \"./index.node\"` で読むので、" +
          "空文字はそのまま `require(\"\")` に渡り `ERR_INVALID_ARG_VALUE` で落ちる。" +
          "**この変数を未設定にするか、実在するパスを入れること**（バイナリ自体は無関係）"
      : `${target} をロードできない`,
    // **エラーの `code` も出す。** `err.stack` には入らないが、これが原因の当たりになる
    // （`MODULE_NOT_FOUND` なら場所の問題、`ERR_INVALID_ARG_VALUE` なら値の問題、
    //  リンカのエラーならアーキテクチャ／共有ライブラリの問題）。
    // パッケージ側と同じ `code` で落ちているかを、テストがこれで照合する。
    err instanceof Error
      ? `${err.code ? `code: ${err.code}\n` : ""}${err.stack ?? err.message}`
      : String(err),
  );
}
