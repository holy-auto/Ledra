// D-A7 是正の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/sanitize.check.ts
import assert from "node:assert/strict";

import { escapeIlike, escapePostgrestValue } from "./sanitize.ts";

// ── escapeIlike: ワイルドカードをエスケープする ──
assert.equal(escapeIlike("50%off"), "50\\%off");
assert.equal(escapeIlike("a_b"), "a\\_b");
assert.equal(escapeIlike("a\\b"), "a\\\\b");
assert.equal(escapeIlike("山田太郎"), "山田太郎");

// ── escapePostgrestValue: .or() の構文文字を除去する ──
assert.equal(escapePostgrestValue("Tanaka, Taro"), "Tanaka Taro");
assert.equal(escapePostgrestValue("(090) 1234-5678"), "090 1234-5678");
assert.equal(escapePostgrestValue("山田太郎"), "山田太郎");

// ── D-A7 が実際に壊れていた形: 検索語に , ( ) を含むと .or() 文字列が壊れる ──
// 顧客名の検索語を実際に組み立て、区切りに使う `,` が含まれていないことを確認する。
const search = "田中, (株)テスト";
const safe = escapePostgrestValue(escapeIlike(search));
const filter = `name.ilike.%${safe}%,phone.ilike.%${safe}%,name_kana.ilike.%${safe}%`;
// PostgREST の or= は3つの条件をカンマ区切りで受け取るはず。
// safe 自体にカンマ/括弧が残っていれば、split結果が3件からずれる。
assert.equal(filter.split(",").length, 3, `.or() の区切りが壊れている: ${filter}`);
assert.ok(!safe.includes(","), "safe にカンマが残っている");
assert.ok(!safe.includes("("), "safe に開き括弧が残っている");
assert.ok(!safe.includes(")"), "safe に閉じ括弧が残っている");

console.log("sanitize.check.ts OK");
