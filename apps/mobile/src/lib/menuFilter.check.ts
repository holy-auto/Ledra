// menuFilter の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/menuFilter.check.ts
import assert from "node:assert/strict";

import {
  POPULAR_LIMIT,
  menuCategories,
  filterMenuItems,
  padToColumns,
} from "./menuFilter.ts";

const item = (name: string, category_large: string | null = null) => ({
  name,
  category_large,
});

// --- カテゴリ一覧 ---
// 品目が少ないうちは「よく使う」を出さない（「すべて」と同じ内容になるため）
assert.deepEqual(menuCategories([item("A", "整備"), item("B", "用品")]), [
  "すべて",
  "整備",
  "用品",
]);

// category_large が null の品目は「未分類」に寄る
assert.deepEqual(menuCategories([item("A"), item("B", "整備")]), [
  "すべて",
  "整備",
  "未分類",
]);

// POPULAR_LIMIT を超えたら「よく使う」が先頭に付く
const many = Array.from({ length: POPULAR_LIMIT + 1 }, (_, i) =>
  item(`品目${i}`, "整備"),
);
assert.deepEqual(menuCategories(many), ["よく使う", "すべて", "整備"]);

// 合成名と同名の実カテゴリは弾く（key 重複と誤表示の防止）
assert.deepEqual(menuCategories([item("A", "すべて"), item("B", "整備")]), [
  "すべて",
  "整備",
]);
assert.deepEqual(
  menuCategories(
    Array.from({ length: POPULAR_LIMIT + 1 }, () => item("X", "よく使う")),
  ),
  ["よく使う", "すべて"],
);

// --- 絞り込み ---
const catalog = [
  item("エンジンオイル交換", "整備"),
  item("オイルフィルター", "整備"),
  item("フロアマット", "用品"),
  item("預り金", null),
];

assert.equal(filterMenuItems(catalog, "すべて", "").length, 4);
assert.deepEqual(
  filterMenuItems(catalog, "整備", "").map((i) => i.name),
  ["エンジンオイル交換", "オイルフィルター"],
);
// 「未分類」は category_large === null を指す
assert.deepEqual(
  filterMenuItems(catalog, "未分類", "").map((i) => i.name),
  ["預り金"],
);

// 検索はカテゴリより優先し、カテゴリを跨いで探す。
// 「用品」を開いたまま整備品目を検索しても見つかること
assert.deepEqual(
  filterMenuItems(catalog, "用品", "オイル").map((i) => i.name),
  ["エンジンオイル交換", "オイルフィルター"],
);
// 空白だけの検索語はカテゴリ絞り込みに戻る
assert.deepEqual(
  filterMenuItems(catalog, "用品", "   ").map((i) => i.name),
  ["フロアマット"],
);
// 大文字小文字を無視する
assert.equal(filterMenuItems([item("BGクリーン")], "すべて", "bgク").length, 1);

// 「よく使う」は先頭 POPULAR_LIMIT 件
assert.equal(filterMenuItems(many, "よく使う", "").length, POPULAR_LIMIT);

// --- グリッドのパディング ---
assert.deepEqual(padToColumns([1, 2, 3, 4], 2), [1, 2, 3, 4]);
assert.deepEqual(padToColumns([1, 2, 3], 2), [1, 2, 3, null]);
assert.deepEqual(padToColumns([1, 2, 3, 4, 5], 4), [1, 2, 3, 4, 5, null, null, null]);
assert.deepEqual(padToColumns([], 4), []);
// 埋めた後は必ず列数の倍数になる
for (const n of [2, 3, 4]) {
  for (let len = 0; len <= 9; len++) {
    const padded = padToColumns(Array.from({ length: len }, (_, i) => i), n);
    assert.equal(padded.length % n, 0);
    assert.equal(padded.filter((v) => v !== null).length, len);
  }
}

console.log("menuFilter self-check: OK");
