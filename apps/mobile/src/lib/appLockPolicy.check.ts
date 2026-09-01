// appLock の状態遷移の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/appLockPolicy.check.ts
import assert from "node:assert/strict";

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

// background を経ていない復帰（生体認証プロンプト・通知センター）では開けたまま
assert.equal(lockStateOnForeground({ ...base, awayMs: null }), "open");

// 端末の時刻を戻されて負になったら、経過時間が不明なのでロックする
assert.equal(lockStateOnForeground({ ...base, awayMs: -3_600_000 }), "locked");

// 閉じている状態は enabled の読み取り失敗（false）でも開かない。
// isAppLockEnabledSync は例外を握って false を返すので、順番を誤ると認証なしで外れる
for (const current of ["locked", "needs_setup"] as const) {
  assert.equal(lockStateOnForeground({ ...base, current, awayMs: 1_000 }), current);
  assert.equal(lockStateOnForeground({ ...base, current, awayMs: null }), current);
  assert.equal(
    lockStateOnForeground({ ...base, current, enabled: false, awayMs: null }),
    current,
  );
}

// ただしログアウトすればどの状態からでも開く（ログイン画面に被せない）
assert.equal(
  lockStateOnForeground({ ...base, current: "needs_setup", authenticated: false, awayMs: null }),
  "open",
);

console.log("appLockPolicy self-check: OK");
