/**
 * スタッフ用の公開 PDF リンク（期限付き署名）。 [G3/G4]
 *
 * 公開 PDF（/api/certificate/pdf）は電子交付の承諾ゲートを通る。承諾を撤回した顧客の証明書でも、店舗が
 * **書面で渡すために印刷する**必要はある。モバイルアプリは PDF を端末ブラウザで開くので認証ヘッダーを
 * 付けられない。そこで、認証済みのスタッフにだけ「その証明書・そのテナント・60 秒間」に限った署名を発行し、
 * 公開 PDF はこの署名があるときだけ承諾ゲートを通さない。署名は URL に載るので、期限を短くしている。
 *
 * ponytail: 署名は OAuth state の HMAC 署名（oauthState.ts）を流用し、provider 欄に用途と public_id を入れて
 *   他用途の state と取り違えないようにしている。ただし oauthState は専用鍵が無いと会計連携の鍵（freee と共有）に
 *   フォールバックするので、**専用鍵 INTEGRATION_OAUTH_STATE_SECRET（32 文字以上）があるときだけ**有効にする。
 *   専用の鍵に分けたくなったら、ここだけ差し替える。
 */
import { createOAuthState, verifyOAuthState } from "@/lib/integrations/oauthState";

const TTL_SECONDS = 60;
const purpose = (publicId: string) => `staff-pdf:${publicId}`;

/** 専用鍵が設定されているときだけ使える（フォールバック鍵では発行も検証もしない）。 */
export function isStaffPdfLinkEnabled(): boolean {
  return (process.env.INTEGRATION_OAUTH_STATE_SECRET ?? "").length >= 32;
}

export function createStaffPdfToken(p: { tenantId: string; publicId: string; userId: string }): string {
  if (!isStaffPdfLinkEnabled()) throw new Error("staff PDF link is disabled: INTEGRATION_OAUTH_STATE_SECRET not set");
  return createOAuthState({
    tenantId: p.tenantId,
    provider: purpose(p.publicId),
    userId: p.userId,
    ttlSeconds: TTL_SECONDS,
  });
}

/** 署名が正しく、期限内で、この public_id とテナントのものなら true。 */
export function isValidStaffPdfToken(token: string, publicId: string, tenantId: string): boolean {
  if (!isStaffPdfLinkEnabled()) return false;
  const r = verifyOAuthState({ state: token, provider: purpose(publicId) });
  return r.ok && r.tenantId === tenantId;
}
