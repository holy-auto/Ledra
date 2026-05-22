import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { resolveCertificateMedia, type CertificateMediaRow, type ResolvedCertificateMedia } from "./index";

/**
 * 公開証明書 (public_id) に紐づく certificate_media を署名 URL 付きで取得する。
 * Phase 3 「インタラクティブ証明書ビュー」 の MediaGallery / 公開 API から共用。
 *
 * 証明書が存在しない/`void` 状態の場合は空配列を返す (呼び出し側でハンドリング)。
 */
export async function loadPublicCertificateMedia(publicId: string): Promise<ResolvedCertificateMedia[]> {
  const supabase = createServiceRoleAdmin("public certificate media — public_id lookup, anonymous caller");

  const certRes = await supabase
    .from("certificates")
    .select("id, status")
    .eq("public_id", publicId)
    .limit(1)
    .maybeSingle<{ id: string; status: string | null }>();

  if (!certRes.data?.id) return [];
  if (String(certRes.data.status ?? "").toLowerCase() === "void") return [];

  const mediaRes = await supabase
    .from("certificate_media")
    .select(
      "id, media_type, storage_path, before_path, poster_path, duration_ms, width, height, caption, sort_order, content_type, file_size, created_at, diff_summary, diff_summary_generated_at",
    )
    .eq("certificate_id", certRes.data.id)
    .order("sort_order", { ascending: true })
    .limit(50)
    .returns<CertificateMediaRow[]>();

  if (mediaRes.error || !mediaRes.data) return [];

  return Promise.all(mediaRes.data.map((row) => resolveCertificateMedia(supabase, row)));
}
