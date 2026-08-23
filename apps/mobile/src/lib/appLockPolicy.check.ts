// appLock の状態遷移の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/appLockPolicy.check.ts
import assert from "node:assert";

import { RELOCK_AFTER_MS, lockStateOnForeground } from "./appLockPolicy.ts";

const base = { current: "open" as const, enabled: true, authenticated: true };

// 未ログイン・ロック無効ならロックしない
assert.equal(
  lockStateOnForeground({ ...base, authenticated: false, awayMs: 10 * 60_000 }),
  "open",
);
assert.equal(
  lockStateOnForeground({ ...base, enabled: false, awayMs: 10 * 60_000 }),
  "open",
);

// 閾値未満の離席では開いたまま。現場で数十秒ごとに認証させない
assert.equal(lockStateOnForeground({ ...base, awayMs: 60_000 }), "open");
// 閾値ちょうどはロック（境界を含める）
assert.equal(lockStateOnForeground({ ...base, awayMs: RELOCK_AFTER_MS }), "locked");
assert.equal(lockStateOnForeground({ ...base, awayMs: RELOCK_AFTER_MS + 1 }), "locked");

// background を経ていない復帰（生体認証プロンプト・通知センター）では状態を変えない
assert.equal(lockStateOnForeground({ ...base, awayMs: null }), "open");

// ロック中に離れて戻ってきたらロックのまま。離席が短くても解除されない
assert.equal(
  lockStateOnForeground({ ...base, current: "locked", awayMs: 1_000 }),
  "locked",
);
assert.equal(
  lockStateOnForeground({ ...base, current: "locked", awayMs: null }),
  "locked",
);

console.log("appLockPolicy self-check: OK");
