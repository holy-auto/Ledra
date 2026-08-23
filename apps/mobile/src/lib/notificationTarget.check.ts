// notificationTarget の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/notificationTarget.check.ts
import assert from "node:assert";

import { notificationTarget } from "./notificationTarget.ts";

// 対応のある Web パスはモバイルのルートへ
assert.equal(notificationTarget("/admin/reservations/abc"), "/reservations/abc");
assert.equal(notificationTarget("/admin/certificates/xyz"), "/certificates/xyz");
assert.equal(notificationTarget("/admin/vehicles"), "/vehicles");

// クエリは落とす（モバイル画面が解釈しないため）
assert.equal(
  notificationTarget("/admin/reservations/abc?tab=photos"),
  "/reservations/abc",
);

// 対応する画面が無い Web パスは null（押せる見た目にしない）
assert.equal(notificationTarget("/admin/messages"), null);
assert.equal(notificationTarget("/admin/documents?doc_type=estimate"), null);

// 前方一致の取り違えを防ぐ（/admin/vehiclesXX は /vehicles ではない）
assert.equal(notificationTarget("/admin/vehiclesXX"), null);

// 空・null
assert.equal(notificationTarget(null), null);
assert.equal(notificationTarget(""), null);

// 既にモバイルのパスならそのまま
assert.equal(notificationTarget("/knowledge/abc"), "/knowledge/abc");

console.log("notificationTarget self-check: OK");
