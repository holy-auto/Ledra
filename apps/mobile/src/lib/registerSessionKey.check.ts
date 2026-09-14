// code-review 指摘の回帰確認 (2026-09-09)。フレームワーク不要。
// 実行: node apps/mobile/src/lib/registerSessionKey.check.ts
//
// register.tsx は「店舗の有効なレジを1件引く」register クエリ（is_active/
// sort_order 昇順で1件）と、「セッションを1件引く」register-session クエリの
// 2本を持つ。以前は register-session を店舗経由（registers!inner(store_id)）
// で絞っていたため、店舗に複数のアクティブなレジがある場合、register クエリが
// 選んだレジと register-session クエリが返す最新セッションのレジが食い違い、
// 「画面が表示中のセッションの持ち主」と「open/close ミューテーションが
// register.id として叩くレジ」がズレて、無関係なレジのセッションを締める
// 等の誤操作になっていた。
//
// register-session クエリが register.id に直接紐付いていること（店舗経由の
// 絞り込みに戻っていないこと）、queryKey・invalidateQueries も register.id で
// 揃っていることをソース上で確認する。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "app", "pos", "register.tsx"), "utf8");

// register-session クエリは register_id で直接絞る（店舗経由の内部結合に戻っていない）
assert.match(
  src,
  /\.eq\("register_id",\s*register!\.id\)/,
  "register-session クエリが register_id での絞り込みをやめている（店舗経由に戻すと複数レジでズレる）",
);
assert.doesNotMatch(
  src,
  /\.select\("\*, registers!inner\(store_id\)"\)/,
  "register-session クエリが店舗経由（registers!inner(store_id)）の絞り込みに戻っている",
);

// queryKey・invalidateQueries はいずれも register?.id で揃っている（selectedStore?.id に戻っていない）
const sessionKeyMatches = src.match(/\["register-session",\s*register\?\.id\]/g) ?? [];
assert.ok(
  sessionKeyMatches.length >= 3,
  `register-session の queryKey/invalidateQueries が register?.id で揃っていない（見つかった数: ${sessionKeyMatches.length}, 期待: 3以上 = useQuery + open成功時 + close成功時）`,
);
assert.doesNotMatch(
  src,
  /\["register-session",\s*selectedStore\?\.id\]/,
  "register-session の queryKey/invalidateQueries が selectedStore?.id に戻っている（register クエリとレジがズレる）",
);

console.log("registerSessionKey.check.ts OK");
