// posPayment の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/posPayment.check.ts
import assert from "node:assert/strict";

import {
  paymentSegments,
  isQrFlow,
  isTapToPayFlow,
  isTerminalBusy,
  tapFailureAction,
  recordedMethod,
} from "./posPayment.ts";

const iphone = { isIPhone: true, isIPad: false, isAndroid: false };
const ipad = { isIPhone: false, isIPad: true, isAndroid: false };
const android = { isIPhone: false, isIPad: false, isAndroid: true };

// --- 選択肢 ---
// iPhone だけ「カード」と「QR」が分かれる（Tap to Pay があるため）
assert.deepEqual(
  paymentSegments(iphone).map((s) => s.value),
  ["cash", "card", "qr", "bank_transfer"],
);
assert.deepEqual(
  paymentSegments(ipad).map((s) => s.value),
  ["cash", "card", "bank_transfer"],
);
assert.deepEqual(paymentSegments(ipad), paymentSegments(android));
// iPad/Android の「カード」は実体が QR 決済なので表示もそう書く
assert.equal(paymentSegments(ipad).find((s) => s.value === "card")!.label, "QR決済");
assert.equal(paymentSegments(iphone).find((s) => s.value === "card")!.label, "カード");

// --- 経路の判定 ---
// iPhone の「カード」は Tap to Pay。QR ではない
assert.equal(isTapToPayFlow(iphone, "card"), true);
assert.equal(isQrFlow(iphone, "card"), false);
// iPhone の「QR」は QR
assert.equal(isQrFlow(iphone, "qr"), true);
assert.equal(isTapToPayFlow(iphone, "qr"), false);
// iPad/Android の「カード」は QR 経由
assert.equal(isQrFlow(ipad, "card"), true);
assert.equal(isQrFlow(android, "card"), true);
assert.equal(isTapToPayFlow(ipad, "card"), false);
// 現金・振込はどちらでもない
for (const d of [iphone, ipad, android]) {
  for (const m of ["cash", "bank_transfer"] as const) {
    assert.equal(isQrFlow(d, m), false);
    assert.equal(isTapToPayFlow(d, m), false);
  }
}
// 2つの経路は同時に成立しない（成立すると会計が二重に走る）
for (const d of [iphone, ipad, android]) {
  for (const m of ["cash", "card", "qr", "bank_transfer"] as const) {
    assert.ok(!(isQrFlow(d, m) && isTapToPayFlow(d, m)), `${JSON.stringify(d)} ${m}`);
  }
}

// --- 端末の状態 ---
for (const s of ["creating", "collecting", "processing", "capturing"]) assert.equal(isTerminalBusy(s), true);
for (const s of [null, undefined, "idle", "succeeded", "failed", "cancelled"]) assert.equal(isTerminalBusy(s), false);

// --- タッチ決済が失敗した後の導線 ---
// 決済が成立していない → カード番号入力へ
assert.equal(tapFailureAction(iphone, "card", true, false, null), "card_entry");
// **カードは切られていて記録だけ失敗した → 決して新しい決済を作らない**
assert.equal(tapFailureAction(iphone, "card", true, false, "pi_123"), "retry_record");
// リンクを出した後は出さない（二重に決済を作らせない）
assert.equal(tapFailureAction(iphone, "card", true, true, null), "none");
assert.equal(tapFailureAction(iphone, "card", true, true, "pi_123"), "none");
// 失敗していないのに出してはいけない
assert.equal(tapFailureAction(iphone, "card", false, false, null), "none");
assert.equal(tapFailureAction(iphone, "card", false, false, "pi_123"), "none");
// 失敗のあと支払方法を変えたら消える
for (const m of ["cash", "qr", "bank_transfer"] as const) {
  assert.equal(tapFailureAction(iphone, m, true, false, null), "none", m);
}
// iPad/Android にタッチ決済は無いので、そもそも出ない
for (const d of [ipad, android]) {
  for (const m of ["cash", "card", "qr", "bank_transfer"] as const) {
    assert.equal(tapFailureAction(d, m, true, false, null), "none", `${m}`);
    assert.equal(tapFailureAction(d, m, true, false, "pi_123"), "none", `${m}`);
  }
}

// --- 記録する支払方法 ---
// カード番号入力から始めた分は、経路が QR でも「カード」として残す
assert.equal(recordedMethod("qr", true), "card");
assert.equal(recordedMethod("card", true), "card");
// 通常の QR 決済はそのまま
assert.equal(recordedMethod("qr", false), "qr");
assert.equal(recordedMethod("card", false), "card");
assert.equal(recordedMethod("cash", false), "cash");

console.log("posPayment.check.ts OK");
