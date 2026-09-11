// paymentOutcomeNotify の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/paymentOutcomeNotify.check.ts
import assert from "node:assert/strict";

import { shouldNotifyDeclinedInBackground } from "./paymentOutcomeNotify.ts";

// フォアグラウンドで結果を見られる状態では通知しない
assert.equal(shouldNotifyDeclinedInBackground("active"), false);

// バックグラウンド／遷移中は「結果を見る前に閉じた」とみなして通知する
assert.equal(shouldNotifyDeclinedInBackground("background"), true);
assert.equal(shouldNotifyDeclinedInBackground("inactive"), true);
assert.equal(shouldNotifyDeclinedInBackground("unknown"), true);

console.log("paymentOutcomeNotify.check.ts OK");
