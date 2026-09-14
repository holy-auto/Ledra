// storeSelection の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/storeSelection.check.ts
import assert from "node:assert";

import { pickDefaultStore, type StoreOption } from "./storeSelection.ts";

const store = (id: string, name: string, is_default = false): StoreOption => ({
  id,
  name,
  is_default,
});

// --- 1件だけなら自動選択する（ちらつきを消す本体） ---
assert.deepEqual(pickDefaultStore([store("s1", "本店")]), {
  id: "s1",
  name: "本店",
});
// is_default が付いていても結果は同じ
assert.deepEqual(pickDefaultStore([store("s1", "本店", true)]), {
  id: "s1",
  name: "本店",
});

// --- 0件なら自動選択しない ---
// 設定不備なので隠さず select-store の「店舗が登録されていません」を出す
assert.equal(pickDefaultStore([]), null);

// --- 2件以上なら自動選択しない ---
// ここが将来「デフォルトがあるなら選んであげよう」と親切心で壊されやすい。
// 勝手に選ぶと、別店舗で作業しているスタッフが気づかないまま
// 誤った店舗に記録を作ることになる。
assert.equal(pickDefaultStore([store("s1", "本店"), store("s2", "北店")]), null);
assert.equal(
  pickDefaultStore([store("s1", "本店", true), store("s2", "北店")]),
  null,
);
assert.equal(
  pickDefaultStore([store("s1", "本店"), store("s2", "北店", true)]),
  null,
);
assert.equal(
  pickDefaultStore([store("s1", "A"), store("s2", "B"), store("s3", "C")]),
  null,
);

// --- 返す形は authStore の StoreInfo と同じ {id, name} だけ ---
// is_default を持ち込むと selectedStore の形が崩れる
const picked = pickDefaultStore([store("s1", "本店", true)]);
assert.deepEqual(Object.keys(picked ?? {}).sort(), ["id", "name"]);

// --- 入力を書き換えない ---
const input = [store("s1", "本店")];
const snapshot = JSON.stringify(input);
pickDefaultStore(input);
assert.equal(JSON.stringify(input), snapshot);

console.log("storeSelection self-check: OK");
