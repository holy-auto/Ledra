import { NextRequest } from "next/server";
import { apiOk, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { loadPublicCertificateMedia } from "@/lib/certificateMedia/loadPublic";

export const runtime = "nodejs";

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * 公開ページ用エンドポイント: certificate_media を署名 URL 付きで返す。
 * /c/[public_id] のサーバコンポーネントは publicData 経由で直接 Supabase
 * にアクセスするので必須ではないが、モバイル WebView や外部クライアント向けに
 * 同等情報を取得できる JSON エンドポイントを公開する。
 *
 * B-M2 是正 (2026-09-08): 未認証・単純な public_id 総当たりに対する
 * レート制限と形式検証を追加（他の公開 public_id エンドポイントと同じ
 * `general` プリセット + PUBLIC_ID_RE）。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ public_id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { public_id } = await params;
    if (!PUBLIC_ID_RE.test(public_id)) {
      return apiValidationError("public_id の形式が不正です。");
    }
    const media = await loadPublicCertificateMedia(public_id);
    return apiOk({ media });
  } catch (e) {
    return apiInternalError(e, "public media");
  }
}
