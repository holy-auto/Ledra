import assert from "node:assert/strict";

import { publicCertUrl, certPdfUrl } from "./certificateLinks.ts";

// 末尾スラッシュがあってもなくても同じ URL になる（`//` を作らない）
assert.equal(publicCertUrl("abc", "https://x.jp/c"), "https://x.jp/c/abc");
assert.equal(publicCertUrl("abc", "https://x.jp/c/"), "https://x.jp/c/abc");

// 環境変数が無ければ null。**既定のドメインを勝手に使わない**
assert.equal(publicCertUrl("abc", undefined), null);
assert.equal(certPdfUrl("abc", undefined), null);

// public_id が空なら null（`.../c/` だけのリンクを渡さない）
assert.equal(publicCertUrl("", "https://x.jp/c"), null);
assert.equal(certPdfUrl("", "https://x.jp"), null);

// PDF はクエリに載るのでエスケープする
assert.equal(certPdfUrl("a b", "https://x.jp/"), "https://x.jp/api/certificate/pdf?pid=a%20b");

console.log("certificateLinks.check.ts OK");
