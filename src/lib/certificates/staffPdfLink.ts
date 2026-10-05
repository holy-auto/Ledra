/**
 * スタッフ用の公開 PDF リンク（期限付き署名）。 [G3/G4]
 *
 * 公開 PDF（/api/certificate/pdf）は電子交付の承諾ゲートを通る。承諾を撤回した顧客の証明書でも、店舗が
 * **書面で渡すために印刷する**必要はある。モバイルアプリは PDF を端末ブラウザで開くので認証ヘッダーを
 * 付けられない。そこで、認証済みのスタッフにだけ「その証明書・そのテナント・60 秒間」に限った署名を発行し、
 * 公開 PDF はこの署名があるときだけ承諾ゲートを通さない。署名は URL に載るので、期限を短くしている。
 *
 * 鍵は INTEGRATION_OAUTH_STATE_SECRET（32 文字以上）だけを使う。OAuth state の署名関数（oauthState.ts）は
 * 専用鍵が無いと会計連携の鍵（freee と共有）にフォールバックするので流用しない。署名対象の先頭に用途名を入れて、
 * 同じ鍵で作る OAuth state と取り違えないようにしている。
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 60;
const PURPOSE = "staff-pdf";

function signingKey(): string | null {
  const k = process.env.INTEGRATION_OAUTH_STATE_SECRET ?? "";
  return k.length >= 32 ? k : null;
}

function mac(body: string, k: string): string {
  return createHmac("sha256", k).update(`${PURPOSE}\n${body}`).digest("base64url");
}

/** 専用鍵が設定されているときだけ使える。 */
export function isStaffPdfLinkEnabled(): boolean {
  return signingKey() !== null;
}

export function createStaffPdfToken(p: { tenantId: string; publicId: string }): string {
  const k = signingKey();
  if (!k) throw new Error("staff PDF link is disabled: INTEGRATION_OAUTH_STATE_SECRET not set");
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const body = Buffer.from(JSON.stringify({ t: p.tenantId, p: p.publicId, e: exp }), "utf8").toString("base64url");
  return `${body}.${mac(body, k)}`;
}

/** 署名が正しく、期限内で、この public_id とテナントのものなら true。 */
export function isValidStaffPdfToken(token: string, publicId: string, tenantId: string): boolean {
  const k = signingKey();
  if (!k) return false;
  const [body, sig] = token.split(".");
  if (!body || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(mac(body, k));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const v = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { t?: unknown; p?: unknown; e?: unknown };
    return v.t === tenantId && v.p === publicId && typeof v.e === "number" && v.e >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
