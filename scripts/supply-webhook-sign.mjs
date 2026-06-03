#!/usr/bin/env node
/**
 * 供給パートナー受注確定 Webhook の署名生成 + curl コマンド出力 (実地テスト用)。
 *
 * Webhook 仕様: パートナーは共有シークレットで本文を HMAC-SHA256 署名し、
 *   `X-Ledra-Signature: sha256=<hex>` ヘッダで POST する。
 *   (src/lib/supply/webhookSignature.ts の computeSupplyWebhookSignature と同一)
 *
 * 使い方:
 *   node scripts/supply-webhook-sign.mjs <webhook_url> <secret> [po_number] [status] [external_order_id]
 *
 *   - webhook_url       : /agent の「発注API連携」で表示される受信 URL
 *                         (例 https://app.example.com/api/webhooks/supply/<partnerId>)
 *   - secret            : 同画面で発行した whsec_... (一度だけ表示される平文)
 *   - po_number         : 既存の発注番号 (省略時 PO-TEST-0001)
 *   - status            : accepted | confirmed | shipped | rejected (省略時 accepted)
 *   - external_order_id : 先方の注文番号 (任意)
 *
 * 例:
 *   node scripts/supply-webhook-sign.mjs \
 *     https://app.example.com/api/webhooks/supply/11111111-1111-4111-8111-111111111111 \
 *     whsec_xxxxxxxx PO-20260601-1234 accepted ORD-9
 *
 * 注意: これは「パートナー側システムが送る署名付き通知」を手元で再現するツール。
 *   200 {ok:true} が返れば、該当発注の transport_status (acked/failed) と
 *   external_order_id が更新される (PO の status= 入荷計上は人の操作のまま: 壁3)。
 */
import crypto from "node:crypto";

const [, , url, secret, poNumber = "PO-TEST-0001", status = "accepted", externalOrderId] = process.argv;

const VALID_STATUSES = ["accepted", "confirmed", "shipped", "rejected"];

if (!url || !secret) {
  console.error(
    "usage: node scripts/supply-webhook-sign.mjs <webhook_url> <secret> [po_number] [status] [external_order_id]\n" +
      "  status: " +
      VALID_STATUSES.join(" | "),
  );
  process.exit(1);
}
if (!VALID_STATUSES.includes(status)) {
  console.error(`invalid status "${status}". must be one of: ${VALID_STATUSES.join(", ")}`);
  process.exit(1);
}

const payload = { po_number: poNumber, status };
if (externalOrderId) payload.external_order_id = externalOrderId;

// 署名対象は送信する生ボディそのもの。JSON.stringify の出力をそのまま署名 & 送信する。
const rawBody = JSON.stringify(payload);
const signature = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

console.log("# payload (raw body):");
console.log(rawBody);
console.log("\n# X-Ledra-Signature:");
console.log(signature);
console.log("\n# curl (このまま実行できます):");
console.log(
  `curl -sS -X POST '${url}' \\\n` +
    `  -H 'content-type: application/json' \\\n` +
    `  -H 'x-ledra-signature: ${signature}' \\\n` +
    `  --data '${rawBody}'`,
);
