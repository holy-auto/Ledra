// 作業一覧の表示モード別の密度と描画量を確認する自己チェック。
// 実行: node apps/mobile/src/lib/workPresentation.check.ts
import assert from "node:assert/strict";

import { getWorkPresentation } from "./workPresentation.ts";

assert.deepEqual(getWorkPresentation("simple"), {
  cardVariant: "simple",
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  queryLimit: 200,
  windowSize: 5,
});

assert.deepEqual(getWorkPresentation("standard"), {
  cardVariant: "standard",
  initialNumToRender: 10,
  maxToRenderPerBatch: 10,
  queryLimit: 200,
  windowSize: 7,
});

assert.deepEqual(getWorkPresentation("dense"), {
  cardVariant: "dense",
  initialNumToRender: 16,
  maxToRenderPerBatch: 16,
  queryLimit: 200,
  windowSize: 9,
});

console.log("workPresentation.check.ts OK");
