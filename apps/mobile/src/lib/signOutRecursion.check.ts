// code-review 指摘の回帰確認 (2026-09-08)。フレームワーク不要。
// 実行: node apps/mobile/src/lib/signOutRecursion.check.ts
//
// mobileApi は 401 を受けると handleUnauthorized() を呼ぶ。
// handleUnauthorized() → bindUnauthorizedHandler() で結線された
// signOutEverywhere() → unregisterPushNotifications() → mobileApi(DELETE) という
// 経路がある。セッションが既に破棄された状態で unregisterPushNotifications() の
// mobileApi 呼び出しが 401 を受けると、何もガードが無ければ
// handleUnauthorized() を再度呼び、自分自身を無限に呼び直す
// （ログイン画面への遷移も store のリセットも一切完了しなくなる）。
//
// mobileApi(...) 呼び出しに skipUnauthorizedHandler を渡せること・
// api.ts 側がそれを実際に読んで 401 ハンドラをスキップすること・
// push.ts の DELETE 呼び出しが実際にそれを渡していることをソース上で確認する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const apiSrc = readFileSync(join(here, "api.ts"), "utf8");
const pushSrc = readFileSync(join(here, "push.ts"), "utf8");

// api.ts: ApiOptions に skipUnauthorizedHandler が定義されている
assert.match(
  apiSrc,
  /skipUnauthorizedHandler\?:\s*boolean/,
  "api.ts の ApiOptions に skipUnauthorizedHandler が無い",
);

// api.ts: セッション無し・401 の両分岐で skipUnauthorizedHandler を実際に見ている
assert.match(
  apiSrc,
  /if\s*\(!skipUnauthorizedHandler\)\s*await handleUnauthorized\(\)/,
  "api.ts の「トークン無し」分岐が skipUnauthorizedHandler を見ていない",
);
assert.match(
  apiSrc,
  /response\.status === 401 && !skipUnauthorizedHandler/,
  "api.ts の 401 分岐が skipUnauthorizedHandler を見ていない",
);

// push.ts: unregisterPushNotifications の DELETE 呼び出しが
// skipUnauthorizedHandler: true を渡している。関数本体（次の export function
// または EOF まで）に絞ってから探す — register 側の POST 呼び出しを誤って
// 拾わないように。
const fnStart = pushSrc.indexOf("export async function unregisterPushNotifications");
assert.ok(fnStart >= 0, "push.ts に unregisterPushNotifications が見つからない");
const nextFnStart = pushSrc.indexOf("\nexport ", fnStart + 1);
const fnBody = nextFnStart >= 0 ? pushSrc.slice(fnStart, nextFnStart) : pushSrc.slice(fnStart);

assert.match(
  fnBody,
  /method:\s*"DELETE"/,
  "push.ts の unregisterPushNotifications に DELETE 呼び出しが見つからない",
);
assert.match(
  fnBody,
  /skipUnauthorizedHandler:\s*true/,
  "push.ts の unregisterPushNotifications が skipUnauthorizedHandler: true を渡していない" +
    "（signOutEverywhere 経由でセッション破棄後に呼ばれると 401 ハンドラを無限に呼び直す）",
);

console.log("signOutRecursion.check.ts OK");
