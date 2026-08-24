// storeScope の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/storeScope.check.ts
import assert from "node:assert";

import { scopeToStore } from "./storeScope.ts";

/** `.or()` に何が渡ったかだけ覚える最小のダブル */
function fakeQuery() {
  const calls: string[] = [];
  const q = {
    calls,
    or(filter: string) {
      calls.push(filter);
      return q;
    },
  };
  return q;
}

// --- 店舗を選んでいない: 何も足さない ---
for (const none of [null, undefined, ""]) {
  const q = fakeQuery();
  assert.equal(scopeToStore(q, none), q);
  assert.deepEqual(q.calls, [], `店舗なし(${JSON.stringify(none)})で絞ってはいけない`);
}

// --- 店舗を選んだ: 店舗一致 **または** 店舗未設定 ---
// ここが本題。`.eq("store_id", id)` にすると、store_id を入れていない
// 既存データ（本番は全行 null）が1件も出なくなる
const q = fakeQuery();
assert.equal(scopeToStore(q, "s-1"), q); // 同じビルダーを返す（チェーンが続く）
assert.deepEqual(q.calls, ["store_id.eq.s-1,store_id.is.null"]);

console.log("storeScope.check.ts OK");
