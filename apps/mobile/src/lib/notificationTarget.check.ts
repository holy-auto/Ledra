// notificationTarget の自己チェック。フレームワーク不要。
// 実行: node apps/mobile/src/lib/notificationTarget.check.ts
import assert from "node:assert/strict";

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
assert.equal(notificationTarget("/admin/billing"), null);
assert.equal(notificationTarget("/admin/market/orders/abc"), null);

// 前方一致の取り違えを防ぐ（/admin/vehiclesXX は /vehicles ではない）
assert.equal(notificationTarget("/admin/vehiclesXX"), null);

// 空・null
assert.equal(notificationTarget(null), null);
assert.equal(notificationTarget(""), null);

// 既にモバイルのパスならそのまま
assert.equal(notificationTarget("/knowledge/abc"), "/knowledge/abc");

// 実在しないモバイルパスは通さない（素通しすると白画面になる）
assert.equal(notificationTarget("/billing/abc"), null);
assert.equal(notificationTarget("/knowledgeXX"), null);

// プロトコル相対 URL は外部遷移になりうるので通さない
assert.equal(notificationTarget("//evil.com"), null);
assert.equal(notificationTarget("/admin/vehicles//evil.com"), null);

// ── メッセージ ──
assert.equal(notificationTarget("/admin/messages"), "/messages");
// 顧客スレッドはクエリを落とすと「受信箱トップ」になってしまうのでパスへ移す
assert.equal(
  notificationTarget("/admin/messages?thread=c:abc-123"),
  "/messages/c%3Aabc-123",
);
assert.equal(notificationTarget("/admin/messages?thread=l:U1"), "/messages/l%3AU1");
assert.equal(notificationTarget("/admin/messages?thread=e:a@b.com"), "/messages/e%3Aa%40b.com");
// 形式が違う thread は無視して受信箱トップへ（不正値でルートを組み立てない）
assert.equal(notificationTarget("/admin/messages?thread=../../evil"), "/messages");
assert.equal(notificationTarget("/admin/messages?thread="), "/messages");

// ── 帳票 ──
// 発行側は doc_type= を書くが Web 画面は type= を読む。どちらで来ても拾う
assert.equal(
  notificationTarget("/admin/documents?doc_type=estimate"),
  "/documents?type=estimate",
);
assert.equal(notificationTarget("/admin/documents?type=invoice"), "/documents?type=invoice");
// 未知の種別はフィルタを付けず一覧へ
assert.equal(notificationTarget("/admin/documents?doc_type=receipt"), "/documents");
assert.equal(notificationTarget("/admin/documents"), "/documents");
assert.equal(notificationTarget("/admin/documents/abc-123"), "/documents/abc-123");

// ── index を持たないルート ──
// /nfc と /legal は配下の画面しか無い。素のパスで飛ばすと白画面になる
assert.equal(notificationTarget("/nfc"), null);
assert.equal(notificationTarget("/legal"), null);
assert.equal(notificationTarget("/nfc/scan"), "/nfc/scan");
assert.equal(notificationTarget("/legal/terms"), "/legal/terms");

console.log("notificationTarget self-check: OK");
