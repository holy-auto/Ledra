// D-B1 是正の回帰確認。フレームワーク不要。
// 実行: node apps/mobile/src/lib/homeStatusVocab.check.ts
//
// reservations.status の CHECK 制約は confirmed/arrived/in_progress/completed/
// cancelled のみ（CLAUDE.md ドメイン状態語彙ルール、正準モジュール
// src/lib/domain/states.ts 参照）。ホーム画面の集計が "delivered" /
// "awaiting_confirmation" という存在しない値と比較していたため、「確認待ち」
// ピルが常に0だった。ソースを読んで、この存在しない値との比較が
// 復活していないかを機械的に検出する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "app", "(tabs)", "index.tsx"), "utf8");

// r.status との比較に存在しない値が使われていないか
const INVALID_STATUS_VALUES = ["delivered", "awaiting_confirmation"];
for (const value of INVALID_STATUS_VALUES) {
  const pattern = new RegExp(`status\\s*===\\s*"${value}"`);
  assert.equal(
    pattern.test(src),
    false,
    `(tabs)/index.tsx が reservations.status に存在しない値 "${value}" と比較している`,
  );
}

// 確認待ちの集計は signoff_status を見ていること（status ではない）
assert.match(
  src,
  /signoff_status\s*===\s*"awaiting"/,
  "(tabs)/index.tsx が signoff_status==='awaiting' で確認待ちを算出していない",
);

// signoff_status を select しているか（列を引かずに参照だけしても実行時に undefined になる）
assert.match(
  src,
  /select\(\s*"id,\s*status,\s*signoff_status"/,
  "(tabs)/index.tsx の todayRes クエリが signoff_status を select していない",
);

// code-review 指摘の回帰確認 (2026-09-08): status と signoff_status は独立した別軸で、
// status='completed' かつ signoff_status='awaiting'（施工完了・お客様サイン待ち）は
// 普通に起こる組み合わせ (src/lib/signoff/state.ts 参照)。notStarted の計算式が
// awaitingConfirmation をもう一度引くと、この組み合わせの予約が二重に差し引かれ、
// 「未完了」ピルが過小に出る。notStarted は status 単独の3分割だけで決めること。
assert.match(
  src,
  /const notStarted = todayTotal - todayCompleted - inProgressCount;/,
  "notStarted の計算に awaitingConfirmation が混ざっている（status と signoff_status の二重差引になる）",
);

console.log("homeStatusVocab.check.ts OK");
