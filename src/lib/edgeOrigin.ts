/**
 * リクエストが Cloudflare（最低 TLS 1.3、docs/c2pa-evidence/cloudflare-tls13-runbook.md）を通って来たか。
 * Cloudflare の Transform Rule が付ける `x-ledra-origin-secret` を `CF_ORIGIN_SECRET` と照合する。
 * `*.vercel.app` への直アクセスはこのヘッダを持たない。秘密が未設定なら常に false。
 *
 * proxy（getClientIp）からも呼ばれるため node:crypto に頼らず、長さ一致後は全文字を比べる定数時間比較にする。
 */
export function fromCloudflareEdge(req: Request, secret = process.env.CF_ORIGIN_SECRET): boolean {
  if (!secret) return false;
  const got = req.headers.get("x-ledra-origin-secret") ?? "";
  if (got.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i++) diff |= got.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}
