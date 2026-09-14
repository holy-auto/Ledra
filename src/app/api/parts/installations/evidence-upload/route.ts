/**
 * POST /api/parts/installations/evidence-upload
 *
 * 現場タブレットの「撮るだけ」経路の最初の一歩。装着写真を 1 枚アップロードし、
 * サーバ側で SHA-256 / 知覚ハッシュ / EXIF 撮影日時 / 改ざん疑い flag / RFC3161 TSA
 * （設定時のみ）を算出して返す。**装着レコードはまだ作らない**。クライアントは返った
 * メタ (storage_path / sha256 / perceptual_hash / exif_captured_at / authenticity_grade /
 * integrity_flags / tsa_authority / tsa_timestamp_at) を作成 API
 * (`POST /api/parts/installations`) の evidence[] に渡すため、写真は content_hash
 * （顧客が署名する manifest）に確実に取り込まれる（作成後に追記して署名対象の外に
 * 漏れることがない）。
 *
 * 納品書 (kind=delivery_note) は OCR + 三方照合を伴う専用経路を使う。本経路は装着・
 * 文脈・旧品・封印・刻印等の写真用。
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiInternalError, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { stageInstallationPhoto, INSTALL_PHOTO_KINDS, type InstallPhotoKind } from "@/lib/parts/evidenceService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

/** sharp / exifr が扱える代表的な画像のみ許可（マジックバイト判定）。 */
function detectMime(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const form = await req.formData();

    const kindRaw = String(form.get("kind") ?? "");
    if (!(INSTALL_PHOTO_KINDS as readonly string[]).includes(kindRaw)) {
      return apiValidationError(`kind は ${INSTALL_PHOTO_KINDS.join(" / ")} のいずれかを指定してください。`);
    }

    const file = form.get("photo");
    if (!(file instanceof File) || file.size === 0) {
      return apiValidationError("写真ファイル (photo) が必要です。");
    }
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`ファイルサイズが大きすぎます (上限 ${MAX_FILE_BYTES / 1024 / 1024}MB)。`);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mime = detectMime(buffer);
    if (!mime) {
      return apiValidationError("対応していないファイル形式です (JPEG・PNG・WebP・GIF のみ)。");
    }

    const staged = await stageInstallationPhoto({
      admin,
      tenantId,
      kind: kindRaw as InstallPhotoKind,
      buffer,
      arrayBuffer,
      mime,
    });

    return apiJson({ ok: true, ...staged }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts/installations/evidence-upload POST");
  }
}
