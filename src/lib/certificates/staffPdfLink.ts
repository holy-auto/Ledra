/**
 * スタッフ用の公開 PDF リンク（期限付き署名）。 [G3/G4]
 *
 * 公開 PDF（/api/certificate/pdf）は電子交付の承諾ゲートを通る。承諾を撤回した顧客の証明書でも、店舗が
 * **書面で渡すために印刷する**必要はある。モバイルアプリは PDF を端末ブラウザで開くので認証ヘッダーを
 * 付けられない。そこで、認証済みのスタッフにだけ「その証明書・そのテナント・5 分間」に限った署名を発行し、
 * 公開 PDF はこの署名があるときだけ承諾ゲートを通さない。
 *
 * ponytail: 署名は OAuth state の HMAC 署名（oauthState.ts）を流用する。provider 欄に用途と public_id を入れて
 *   他用途の state と取り違えないようにしている。専用の鍵が要るほど分けたくなったら、ここだけ差し替える。
 */
import { createOAuthState, verifyOAuthState } from "@/lib/integrations/oauthState";

const TTL_SECONDS = 5 * 60;
const purpose = (publicId: string) => `staff-pdf:${publicId}`;

export function createStaffPdfToken(p: { tenantId: string; publicId: string; userId: string }): string {
  return createOAuthState({
    tenantId: p.tenantId,
    provider: purpose(p.publicId),
    userId: p.userId,
    ttlSeconds: TTL_SECONDS,
  });
}

/** 署名が正しく、期限内で、この public_id とテナントのものなら true。 */
export function isValidStaffPdfToken(token: string, publicId: string, tenantId: string): boolean {
  const r = verifyOAuthState({ state: token, provider: purpose(publicId) });
  return r.ok && r.tenantId === tenantId;
}
