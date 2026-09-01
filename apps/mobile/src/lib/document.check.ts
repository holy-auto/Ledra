// 帳票型のコピーが Web 側とズレていないことの自己チェック。
// 実行: node apps/mobile/src/lib/document.check.ts
//
// 種別・ステータス・遷移表が食い違うと、モバイルで押せたステータス変更が
// サーバに弾かれる（逆に、サーバが許す遷移をモバイルが出さない）。
// Metro はアプリディレクトリの外を解決しないため import 共有ができないので、
// 法務文書 (legal.check.ts) と同じくコピー + ズレ検出で担保する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

const web = read("../../../../src/types/document.ts");
const mobile = read("../types/document.ts");

// モバイル側は先頭に「コピーである」旨の注意書きだけを足している。
const BANNER_END = "// 変更するときは src/types/document.ts を直し、このファイルへコピーし直すこと。\n\n";
const idx = mobile.indexOf(BANNER_END);
assert.notEqual(idx, -1, "モバイル側のコピー注意書きが見つかりません");
const mobileBody = mobile.slice(idx + BANNER_END.length);

assert.equal(
  mobileBody,
  web,
  "apps/mobile/src/types/document.ts が src/types/document.ts とズレています。" +
    "Web 側を正として cp し直してください。",
);

console.log("document types self-check: OK");
