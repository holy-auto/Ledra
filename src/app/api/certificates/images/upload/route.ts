
import { apiInternalError } from "@/lib/api/response";

import { handleCertificateImageUpload } from "@/lib/certificateImages/uploadHandler";

import { withCaller } from "@/lib/api/withCaller";
export const runtime = "nodejs";
// Allow up to 60s for image processing + verification providers.
// Without this, Vercel Hobby caps at 10s and slow providers (polygon
// anchoring, deepfake detection) can cause a 504 HTML response, which
// the client sees as a generic "アップロードに失敗しました" error.
export const maxDuration = 60;

// ブラウザ管理画面（cookie セッション）からの証明書写真アップロード。
// 認証・レート制限だけ行い、本体は共有ハンドラに委譲する（モバイル Bearer 経路と同一ロジック）。
export const POST = withCaller(
  async (req, { caller }) => {
    // 認証・レート制限の予期せぬ例外も構造化 500 (apiInternalError) で返す（抽出前の挙動を維持）。
    try {
      // ── Rate limit: 20 uploads per user per minute ───────────────

      // ── Auth (resolveCallerWithRole for proper tenant isolation) ──

      return await handleCertificateImageUpload(req, caller.tenantId);
    } catch (e) {
      return apiInternalError(e, "image upload");
    }
  },
  { rateLimit: "general", permission: "certificates:edit", routeName: "image upload" },
);
