// ホーム画面の表示モード別の見せ方の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/homePresentation.check.ts
//
// もとは web 側の src/lib/ui-preferences/__tests__/mobileHomePresentation.test.ts に
// あったが、そこから apps/mobile のソースを直接 import していた。ルートの
// package.json に workspaces が無く、web の CI は root の npm ci しか実行しないため、
// apps/mobile/tsconfig.json が継承する expo/tsconfig.base が解決できず落ちていた。
// モバイルの関数はモバイル側で検査する。
import assert from "node:assert/strict";

import { getHomePresentation } from "./homePresentation.ts";

// かんたん表示では次の操作を先頭にして詳細な状態を隠す
assert.deepEqual(getHomePresentation("simple"), {
  activeWorkLimit: 3,
  collapseScope: true,
  nextActionFirst: true,
  showDetailedStatus: false,
});

// 標準表示では通常の順序と情報量を維持する
assert.deepEqual(getHomePresentation("standard"), {
  activeWorkLimit: 3,
  collapseScope: false,
  nextActionFirst: false,
  showDetailedStatus: true,
});

// 一覧表示では進行中案件を6件まで表示する
assert.deepEqual(getHomePresentation("dense"), {
  activeWorkLimit: 6,
  collapseScope: false,
  nextActionFirst: false,
  showDetailedStatus: true,
});

console.log("homePresentation.check.ts OK");
