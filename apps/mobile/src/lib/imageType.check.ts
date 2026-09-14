// 画像の種別判定と、サーバ側の受け入れ条件とのズレの自己チェック。
// 実行: node apps/mobile/src/lib/imageType.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { imageTypeFromUri } from "./imageType.ts";

// ── 拡張子から MIME ──
assert.equal(imageTypeFromUri("file:///tmp/a.jpg"), "image/jpeg");
assert.equal(imageTypeFromUri("file:///tmp/a.jpeg"), "image/jpeg");
assert.equal(imageTypeFromUri("file:///tmp/a.PNG"), "image/png");
// Android は元が HEIC でも quality<1 の圧縮で .jpeg を書き出す。
// ここを mimeType 優先にすると「実体は JPEG なのに HEIC 判定で弾く」ことになる
assert.equal(imageTypeFromUri("file:///tmp/ImagePicker/abc.jpeg"), "image/jpeg");
assert.equal(imageTypeFromUri("file:///tmp/a.heic"), "image/heic");
assert.equal(imageTypeFromUri("file:///tmp/a.heif"), "image/heic");
assert.equal(imageTypeFromUri("file:///tmp/a.webp"), "image/webp");

// クエリ・フラグメント付きでも拡張子を拾う
assert.equal(imageTypeFromUri("file:///tmp/a.png?width=100"), "image/png");
assert.equal(imageTypeFromUri("file:///tmp/a.png#frag"), "image/png");

// 判別できないものは null（呼び出し側で asset.mimeType へ落とす）
assert.equal(imageTypeFromUri("file:///tmp/noext"), null);
assert.equal(imageTypeFromUri("file:///tmp/a.mp4"), null);

// ── サーバの受け入れ条件とのズレ検出 ──
// LINE へ送れる形式は sendImage.ts が正。画面側の定数がズレると、送れるものを
// 送れないと言う（またはその逆で無駄にアップロードして 400 になる）。
const here = dirname(fileURLToPath(import.meta.url));
const server = readFileSync(resolve(here, "../../../../src/lib/messages/sendImage.ts"), "utf8");
const screen = readFileSync(resolve(here, "../app/messages/[key].tsx"), "utf8");

const serverTypes = server.match(/const ALLOWED_TYPES = new Set\(\[([^\]]+)\]\)/)?.[1];
const screenTypes = screen.match(/const ALLOWED_IMAGE_TYPES = \[([^\]]+)\]/)?.[1];
assert.ok(serverTypes, "sendImage.ts の ALLOWED_TYPES が見つかりません");
assert.ok(screenTypes, "会話画面の ALLOWED_IMAGE_TYPES が見つかりません");
const norm = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean)
    .sort()
    .join(",");
assert.equal(
  norm(screenTypes),
  norm(serverTypes),
  "会話画面の許可形式が src/lib/messages/sendImage.ts とズレています",
);

// アップロード上限は「画面 <= サーバ」でなければならない。
// 画面の方が緩いと、通る想定で送って必ずサーバに弾かれる
const serverMax = server.match(/const MAX_IMAGE_BYTES = (\d+) \* 1024 \* 1024/)?.[1];
const screenMax = screen.match(/const MAX_UPLOAD_BYTES = (\d+) \* 1024 \* 1024/)?.[1];
assert.ok(serverMax && screenMax, "アップロード上限の定義が見つかりません");
assert.ok(
  Number(screenMax) <= Number(serverMax),
  `画面の上限 ${screenMax}MB がサーバの ${serverMax}MB を超えています`,
);

console.log("imageType self-check: OK");
