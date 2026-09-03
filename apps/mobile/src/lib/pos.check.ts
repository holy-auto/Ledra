// pos の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/pos.check.ts
import assert from "node:assert/strict";

import { paymentIdOf, toPosItems } from "./pos.ts";

// --- 素直な形 ---
assert.equal(paymentIdOf({ ok: true, result: { payment_id: "p1" } }), "p1");

// --- jsonb が文字列で返る経路 ---
assert.equal(paymentIdOf({ ok: true, result: '{"payment_id":"p2"}' }), "p2");

// --- 取り出せないものは null。ここで例外を投げると会計後に画面が固まる ---
assert.equal(paymentIdOf(null), null);
assert.equal(paymentIdOf(undefined), null);
assert.equal(paymentIdOf({}), null);
assert.equal(paymentIdOf({ result: null }), null);
assert.equal(paymentIdOf({ result: "壊れたJSON" }), null);
assert.equal(paymentIdOf({ result: [] }), null);
assert.equal(paymentIdOf({ result: { payment_id: "" } }), null);
assert.equal(paymentIdOf({ result: { payment_id: 123 } }), null);
// 支払は作れたが id が返らない場合。レシートへは飛ばせないが例外にはしない
assert.equal(paymentIdOf({ ok: true, result: { document_id: "d1" } }), null);

// --- toPosItems ---
// 予約側: amount は計算済み。そのまま使う
assert.deepEqual(
  toPosItems([{ name: "洗車", quantity: 2, unitPrice: 1500, amount: 3000 }]),
  [{ description: "洗車", quantity: 2, unit_price: 1500, amount: 3000 }],
);

// カート側: amount を持たないので単価×数量で補う
assert.deepEqual(toPosItems([{ name: "コーティング", quantity: 3, unitPrice: 1000 }]), [
  { description: "コーティング", quantity: 3, unit_price: 1000, amount: 3000 },
]);

// 単価不明（予約側で amount=null）は 0。合計の出し方（menuItemsTotal）と揃える
assert.deepEqual(toPosItems([{ name: "見積", quantity: 1, unitPrice: null, amount: null }]), [
  { description: "見積", quantity: 1, unit_price: 0, amount: 0 },
]);

// 送る明細の合計が画面の合計とずれない（ずれると領収書の金額が合わない）
const cart = [
  { name: "A", quantity: 2, unitPrice: 1200 },
  { name: "B", quantity: 1, unitPrice: 800 },
];
assert.equal(
  toPosItems(cart).reduce((sum, i) => sum + i.amount, 0),
  cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
);

// 品名のキーは帳票と同じ description。name で送ると Web/PDF で品名が消える
assert.deepEqual(Object.keys(toPosItems([{ name: "A", quantity: 1, unitPrice: 1 }])[0]).sort(), [
  "amount",
  "description",
  "quantity",
  "unit_price",
]);

console.log("pos.check.ts OK");
