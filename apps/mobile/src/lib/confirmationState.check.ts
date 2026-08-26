import assert from "node:assert/strict";

import { confirmationState } from "./confirmationState.ts";

const NOW = new Date("2026-08-26T00:00:00Z");

// 行が無ければ「未送信」
assert.equal(confirmationState(null, NOW).label, "未送信");

// **送っていない と 届いたが未確認 を分ける。**（次にする行動が違う）
assert.equal(confirmationState({ status: "pending" }, NOW).label, "未送信");
assert.equal(
  confirmationState({ status: "pending", notification_sent_at: "2026-08-25T00:00:00Z" }, NOW).label,
  "送信済み・未確認",
);

// 署名済みが最優先。期限切れでも「確認済み」を上書きしない
assert.equal(
  confirmationState(
    { status: "signed", signed_at: "2026-08-25T00:00:00Z", expires_at: "2026-08-24T00:00:00Z" },
    NOW,
  ).label,
  "確認済み",
);

// 期限切れは「待つ」ではなく「送り直す」
const expired = confirmationState(
  { status: "pending", notification_sent_at: "2026-08-20T00:00:00Z", expires_at: "2026-08-25T00:00:00Z" },
  NOW,
);
assert.equal(expired.label, "期限切れ");
assert.equal(expired.tone, "problem");

// 期限が未来なら送信済み扱いのまま
assert.equal(
  confirmationState(
    { status: "pending", notification_sent_at: "2026-08-25T00:00:00Z", expires_at: "2026-08-27T00:00:00Z" },
    NOW,
  ).label,
  "送信済み・未確認",
);

assert.equal(confirmationState({ status: "cancelled" }, NOW).label, "取消");

console.log("confirmationState.check.ts OK");
