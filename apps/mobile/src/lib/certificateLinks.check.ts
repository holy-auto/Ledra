import assert from "node:assert/strict";

import { publicCertUrl, certPdfUrl, passportUrl, receiptUrl } from "./certificateLinks.ts";

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

// パスポートはオリジンから。証明書の base は `/c` 込みなので使い回さない
assert.equal(passportUrl("VIN1", "https://x.jp"), "https://x.jp/v/VIN1");
assert.equal(passportUrl("VIN1", "https://x.jp/"), "https://x.jp/v/VIN1");
assert.equal(passportUrl("", "https://x.jp"), null);
// **既定ドメインを持たない。** NFC タグは書いたら後から向き先を直せない
assert.equal(passportUrl("VIN1", undefined), null);

// レシートは `/receipt/<public_id>`。**`/c/` ではない** ―― /c は証明書の公開ページで、
// レシートの id を渡すと必ず 404 になる（実際に2画面がそうなっていた）
assert.equal(receiptUrl("abc", "https://x.jp"), "https://x.jp/receipt/abc");
assert.equal(receiptUrl("abc", "https://x.jp/"), "https://x.jp/receipt/abc");
assert.equal(receiptUrl("a b", "https://x.jp"), "https://x.jp/receipt/a%20b");

// トークンが無い決済（書き込みに失敗した／古い行）は null。
// **null なら共有ボタンを出さない。**壊れたリンクをお客様に送らせない
assert.equal(receiptUrl(null, "https://x.jp"), null);
assert.equal(receiptUrl(undefined, "https://x.jp"), null);
assert.equal(receiptUrl("", "https://x.jp"), null);
// 環境変数が無ければ null（既定ドメインを勝手に使わない）
assert.equal(receiptUrl("abc", undefined), null);

console.log("certificateLinks.check.ts OK");
