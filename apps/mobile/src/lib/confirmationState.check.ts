import assert from "node:assert/strict";

import { confirmationState } from "./confirmationState.ts";

const NOW = new Date("2026-08-26T00:00:00Z");

// 行が無い／未依頼（本番169件すべてがこの状態）
assert.equal(confirmationState(null, NOW).label, "未依頼");
assert.equal(confirmationState({ signoff_status: "not_requested" }, NOW).label, "未依頼");

// **依頼していない と 依頼したが未確認 を分ける。**（次にする行動が違う）
assert.equal(
  confirmationState({ signoff_status: "awaiting", signoff_requested_at: "2026-08-25T00:00:00Z" }, NOW).label,
  "依頼済み・未確認",
);

// 署名済みが最優先。期限を過ぎていても「確認済み」を上書きしない
assert.equal(
  confirmationState(
    { signoff_status: "signed", signed_off_at: "2026-08-25T00:00:00Z", signoff_deadline: "2026-08-24T00:00:00Z" },
    NOW,
  ).label,
  "確認済み",
);

// 期限超過は「待つ」ではなく「催促／依頼し直す」
const overdue = confirmationState(
  { signoff_status: "awaiting", signoff_deadline: "2026-08-25T00:00:00Z" },
  NOW,
);
assert.equal(overdue.label, "期限超過");
assert.equal(overdue.tone, "problem");

// 期限が未来なら依頼済みのまま
assert.equal(
  confirmationState({ signoff_status: "awaiting", signoff_deadline: "2026-08-27T00:00:00Z" }, NOW).label,
  "依頼済み・未確認",
);

// 期限が無ければ超過の判定はしない（deadline が未設定でも「依頼済み」）
assert.equal(confirmationState({ signoff_status: "awaiting" }, NOW).label, "依頼済み・未確認");

console.log("confirmationState.check.ts OK");
