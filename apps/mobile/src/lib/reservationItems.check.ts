// 予約明細の取り出しの自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/reservationItems.check.ts
import assert from "node:assert/strict";

import { parseMenuItems, menuItemsTotal, hasUnknownPrice } from "./reservationItems.ts";

// 通常のデータ
assert.deepEqual(parseMenuItems([{ name: "コーティング", price: 10000, menu_item_id: "abc" }]), [
  { name: "コーティング", unitPrice: 10000, quantity: 1, amount: 10000, menu_item_id: "abc" },
]);

// Web の POS と同じ優先順: unit_price が勝ち、quantity が効く。
// ここがずれると同じ予約が Web とアプリで違う金額になる
assert.deepEqual(parseMenuItems([{ name: "板金", unit_price: 12000, price: 1, quantity: 3 }]), [
  { name: "板金", unitPrice: 12000, quantity: 3, amount: 36000, menu_item_id: null },
]);

// jsonb が null / 配列でない（列が空、または外部連携で壊れた行）
assert.deepEqual(parseMenuItems(null), []);
assert.deepEqual(parseMenuItems(undefined), []);
assert.deepEqual(parseMenuItems({}), []);
assert.deepEqual(parseMenuItems("[]"), []);

// 名前が無い行は落とす（画面に空の明細を出さない）
assert.deepEqual(parseMenuItems([{ price: 100 }, null, 42]), []);

// 数値文字列は数値として扱う（API 側は金額の型を検証していない）
assert.equal(parseMenuItems([{ name: "洗車", price: "12000" }])[0].amount, 12000);

// 読めない金額は 0 円にせず「不明」にする。
// 0 にすると、その金額のまま決済が通って ¥0 の売上が立つ
const unknown = parseMenuItems([{ name: "洗車" }, { name: "磨き", price: "たぶん1万" }]);
assert.equal(unknown[0].amount, null);
assert.equal(unknown[1].amount, null);
assert.equal(hasUnknownPrice(unknown), true);
assert.equal(menuItemsTotal(unknown), 0);

// 全部読める場合は不明フラグが立たない
const ok = parseMenuItems([{ name: "a", price: 100 }, { name: "b", price: 250, quantity: 2 }]);
assert.equal(hasUnknownPrice(ok), false);
assert.equal(menuItemsTotal(ok), 600);
assert.equal(menuItemsTotal([]), 0);
assert.equal(hasUnknownPrice([]), false);

console.log("reservationItems self-check: OK");
