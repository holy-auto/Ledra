// reservationSteps の自己チェック。フレームワーク不要。
// 実行: node --experimental-strip-types apps/mobile/src/lib/reservationSteps.check.ts
import assert from "node:assert/strict";

import { reservationSteps, reservationCurrentStep } from "./reservationSteps.ts";

// --- ステップ定義 ---
assert.deepEqual(
  reservationSteps("scheduled").map((s) => s.key),
  ["customer", "vehicle", "menu", "confirm"],
);
assert.deepEqual(
  reservationSteps("walk_in").map((s) => s.key),
  ["menu", "confirm"],
);

// --- 予約(scheduled) の進捗 ---
// 何も入力なし → 顧客(0)
assert.equal(
  reservationCurrentStep({ mode: "scheduled", hasCustomer: false, hasVehicle: false, hasMenu: false }),
  0,
);
// 顧客のみ → 車両(1)
assert.equal(
  reservationCurrentStep({ mode: "scheduled", hasCustomer: true, hasVehicle: false, hasMenu: false }),
  1,
);
// 顧客+車両 → メニュー(2)
assert.equal(
  reservationCurrentStep({ mode: "scheduled", hasCustomer: true, hasVehicle: true, hasMenu: false }),
  2,
);
// すべて済み → 確認(3)
assert.equal(
  reservationCurrentStep({ mode: "scheduled", hasCustomer: true, hasVehicle: true, hasMenu: true }),
  3,
);
// 途中飛ばし(車両だけ先に埋まる) → 先頭の未完了=顧客(0) を返す
assert.equal(
  reservationCurrentStep({ mode: "scheduled", hasCustomer: false, hasVehicle: true, hasMenu: true }),
  0,
);

// --- 飛び込み(walk_in) の進捗 ---
// 顧客/車両は任意なので無視。メニュー未選択 → メニュー(0)
assert.equal(
  reservationCurrentStep({ mode: "walk_in", hasCustomer: false, hasVehicle: false, hasMenu: false }),
  0,
);
// メニュー選択済み → 確認(1)
assert.equal(
  reservationCurrentStep({ mode: "walk_in", hasCustomer: false, hasVehicle: false, hasMenu: true }),
  1,
);

// current が範囲内であること（完了/現在/未完了が破綻しない）
for (const mode of ["scheduled", "walk_in"] as const) {
  const n = reservationSteps(mode).length;
  const c = reservationCurrentStep({ mode, hasCustomer: true, hasVehicle: true, hasMenu: true });
  assert.ok(c >= 0 && c < n, `current ${c} out of range for ${mode}`);
}

console.log("reservationSteps self-check: OK");
