// code-review 指摘の回帰確認 (2026-09-09)。フレームワーク不要。
// 実行: node apps/mobile/src/lib/pendingDeepLink.check.ts
import assert from "node:assert/strict";
import { protectedDeepLinkPath } from "./pendingDeepLink.ts";

// 保護対象画面へのパスはそのまま（先頭 "/" 付き）で返る
assert.equal(protectedDeepLinkPath("pos/walk-in"), "/pos/walk-in");
assert.equal(protectedDeepLinkPath("/pos/walk-in"), "/pos/walk-in");
assert.equal(protectedDeepLinkPath("reservations/abc-123"), "/reservations/abc-123");
assert.equal(protectedDeepLinkPath("nfc/write/cert-1"), "/nfc/write/cert-1");

// 保護対象外・null・不正な形式は null
assert.equal(protectedDeepLinkPath(null), null);
assert.equal(protectedDeepLinkPath(undefined), null);
assert.equal(protectedDeepLinkPath(""), null);
assert.equal(protectedDeepLinkPath("login"), null, "(auth) 配下は元々ガード外なので対象外");
assert.equal(protectedDeepLinkPath("legal/terms"), null, "legal も元々ガード外なので対象外");
assert.equal(protectedDeepLinkPath("//evil.com"), null, "空セグメント（プロトコル相対URL）は弾く");

console.log("pendingDeepLink.check.ts OK");
