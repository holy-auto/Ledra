import { NextRequest } from "next/server";
import { apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { resolveMobileCaller } from "@/lib/auth/mobileAuth";
import { requireMinRole } from "@/lib/auth/checkRole";
import { handleCertificateImageUpload } from "@/lib/certificateImages/uploadHandler";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * モバイルアプリ（Bearer トークン認証）からの証明書写真アップロード。
 *
 * cookie 経路と同一の共有ハンドラを使うため、モバイル撮影も同じ真正性パイプライン
 * （ハッシュ・GPS除去・TSA封印・端末アテステーション・nonce消費・グレード）を通る。
 * クライアントは capture_nonce / device_token / device_provider をフォームに添付する。
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveMobileCaller(req);
  if (!caller) return apiUnauthorized();
  // 写真アップロードは現場スタッフ以上。
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  return handleCertificateImageUpload(req, caller.tenantId);
}
