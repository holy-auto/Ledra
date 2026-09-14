import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiInternalError, apiForbidden } from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { handleCertificateImageUpload } from "@/lib/certificateImages/uploadHandler";

export const runtime = "nodejs";
// Allow up to 60s for image processing + verification providers.
// Without this, Vercel Hobby caps at 10s and slow providers (polygon
// anchoring, deepfake detection) can cause a 504 HTML response, which
// the client sees as a generic "アップロードに失敗しました" error.
export const maxDuration = 60;

// ブラウザ管理画面（cookie セッション）からの証明書写真アップロード。
// 認証・レート制限だけ行い、本体は共有ハンドラに委譲する（モバイル Bearer 経路と同一ロジック）。
export async function POST(req: NextRequest) {
  // 認証・レート制限の予期せぬ例外も構造化 500 (apiInternalError) で返す（抽出前の挙動を維持）。
  try {
    // ── Rate limit: 20 uploads per user per minute ───────────────
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    // ── Auth (resolveCallerWithRole for proper tenant isolation) ──
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "certificates:edit")) return apiForbidden();

    return await handleCertificateImageUpload(req, caller.tenantId);
  } catch (e) {
    return apiInternalError(e, "image upload");
  }
}
