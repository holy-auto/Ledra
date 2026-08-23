// 予約明細の取り出しの自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/reservationItems.check.ts
import assert from "node:assert";

import { parseMenuItems, menuItemsTotal } from "./reservationItems.ts";

// 通常のデータ
assert.deepEqual(
  parseMenuItems([{ name: "コーティング", price: 10000, menu_item_id: "abc" }]),
  [{ name: "コーティング", price: 10000, menu_item_id: "abc" }],
);

// jsonb が null / 配列でない（列が空、または外部連携で壊れた行）
assert.deepEqual(parseMenuItems(null), []);
assert.deepEqual(parseMenuItems(undefined), []);
assert.deepEqual(parseMenuItems({}), []);
assert.deepEqual(parseMenuItems("[]"), []);

// 名前が無い行は落とす（画面に空の明細を出さない）
assert.deepEqual(parseMenuItems([{ price: 100 }, null, 42]), []);

// 金額が欠けている・数値でない場合は 0 として扱い、画面は落とさない
assert.deepEqual(parseMenuItems([{ name: "洗車" }]), [
  { name: "洗車", price: 0, menu_item_id: null },
]);
assert.deepEqual(parseMenuItems([{ name: "洗車", price: "1000" }]), [
  { name: "洗車", price: 0, menu_item_id: null },
]);
assert.deepEqual(parseMenuItems([{ name: "洗車", price: NaN }]), [
  { name: "洗車", price: 0, menu_item_id: null },
]);

// 合計
assert.equal(menuItemsTotal(parseMenuItems([{ name: "a", price: 100 }, { name: "b", price: 250 }])), 350);
assert.equal(menuItemsTotal([]), 0);

console.log("reservationItems self-check: OK");
