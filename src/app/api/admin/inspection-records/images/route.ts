/**
 * POST /api/admin/inspection-records/images
 *
 * 点検記録の外観写真を Supabase Storage (`assets` バケット) にアップロードし、
 * 公開 URL の配列を返す。点検フォーム (`InspectionRecordForm`) はこの URL を
 * `inspection_records.photo_urls` に保存する。
 *
 * 従来はクライアントで base64 data URL 化して JSONB に直に埋めていたため
 * レコードが肥大化していた。本ルートで Storage 保存に置き換える。
 *
 * 点検写真は証明書写真のような法的証拠 (TSA/C2PA/アンカー) を要さないため、
 * 証明書経路 (`/api/certificates/images/upload`) の重いパイプラインは使わず、
 * 部品エビデンス経路 (`stageInstallationPhoto`) と同じ「GPS/EXIF 除去 → assets 保存」
 * だけの軽量アップロードとする。
 *
 * Body: multipart/form-data
 *   - photos: File (repeated, image/jpeg|png|webp|heic, <= 20MB each, 最大 20 枚)
 *
 * Auth: 施工店セッション (staff 以上)。
 */
import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages"; // 共有 "assets" バケット
import { detectMagicByteMime } from "@/lib/media/magicBytes";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB / 枚
const MAX_PHOTOS = 20;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export async function POST(req: NextRequest) {
  // 1) 認証 (staff 以上)
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "staff")) return apiForbidden();

  // 2) rate limit
  const limited = await checkRateLimit(req, "general", `tenant:${caller.tenantId}`);
  if (limited) return limited;

  // 3) multipart 解析
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return apiValidationError("Content-Type は multipart/form-data を指定してください");
  }
  const form = await req.formData().catch(() => null);
  if (!form) return apiValidationError("multipart の解析に失敗しました");

  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return apiValidationError("photos フィールドに画像を添付してください");
  }
  if (files.length > MAX_PHOTOS) {
    return apiValidationError(`写真は一度に ${MAX_PHOTOS} 枚までです`);
  }

  try {
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const urls: string[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024}MB を超えています`);
      }
      const raw = Buffer.from(await file.arrayBuffer());
      // クライアント申告の MIME ではなくマジックバイトで判定する。
      const mime = detectMagicByteMime(raw);
      if (!mime || !(mime in EXT_BY_MIME)) {
        return apiValidationError("対応形式は JPEG / PNG / WebP / HEIC です");
      }
      // 顧客の自宅駐車場等で撮られ得るため、保存前に GPS/EXIF を除去する
      // (証明書・部品エビデンス経路と同一のプライバシー保護)。
      const { strippedBuffer } = await stripGpsAndReadExif(raw);
      const path = `inspections/${caller.tenantId}/${randomUUID()}.${EXT_BY_MIME[mime]}`;
      const { error: upErr } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(path, strippedBuffer, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
      urls.push(admin.storage.from(CERTIFICATE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl);
    }

    return apiOk({ urls });
  } catch (err) {
    return apiInternalError(err, "POST /api/admin/inspection-records/images");
  }
}
