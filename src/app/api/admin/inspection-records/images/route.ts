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
 *   - photos: File (repeated, image/jpeg|png|webp, <= 20MB each, 最大 20 枚)
 *
 * HEIC/HEIF は受け付けない。sharp が HEIF 未対応ビルドだと stripGpsAndReadExif が
 * 原本 (GPS 付き) にフォールバックして保存され得るうえ、HEIC は多くのブラウザで表示
 * できないため。iOS は accept に HEIC を含めなければ撮影/選択時に JPEG で渡す。
 * HEIC を厳密に扱いたい場合は証明書経路 (変換 + バリアント生成) を使うこと。
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

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB / 枚
const MAX_TOTAL_BYTES = 64 * 1024 * 1024; // 1 リクエスト合計 64MB
const MAX_PHOTOS = 20;
// 同時に sharp デコード/再エンコードする枚数。デコード後のビットマップは
// 元ファイルより遥かに大きい (数十MP × 4byte) ため、無制限並列だと関数メモリを
// 使い切る。少数ずつ処理してメモリ上限を抑える。
const UPLOAD_CONCURRENCY = 3;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
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

  // 読み込む前に file.size で安価に枚数・サイズを検証（メモリを使わない）。
  let totalBytes = 0;
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return apiValidationError(`画像サイズが ${MAX_FILE_BYTES / 1024 / 1024}MB を超えています`);
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_TOTAL_BYTES) {
    return apiValidationError(
      `写真の合計サイズが ${MAX_TOTAL_BYTES / 1024 / 1024}MB を超えています。枚数を減らしてください`,
    );
  }

  try {
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1 枚を read → magic 判定 → GPS/EXIF 除去 → Storage 保存し公開 URL を返す。
    const uploadOne = async (file: File): Promise<string> => {
      const raw = Buffer.from(await file.arrayBuffer());
      // クライアント申告の MIME ではなくマジックバイトで判定する。
      const mime = detectMagicByteMime(raw);
      if (!mime || !(mime in EXT_BY_MIME)) {
        throw new UploadRejected("対応形式は JPEG / PNG / WebP です");
      }
      // 顧客の自宅駐車場等で撮られ得るため、保存前に GPS/EXIF を除去する
      // (証明書・部品エビデンス経路と同一のプライバシー保護)。
      const { strippedBuffer, gpsStripped } = await stripGpsAndReadExif(raw);
      // sharp 失敗時 stripGpsAndReadExif は原本 (GPS 付き) を gpsStripped=false で返す。
      // 位置情報を漏らさないため、その画像は保存せず拒否する（fail-closed）。
      if (!gpsStripped) {
        throw new UploadRejected("画像を安全に処理できませんでした。別の画像でお試しください。");
      }
      const path = `inspections/${caller.tenantId}/${randomUUID()}.${EXT_BY_MIME[mime]}`;
      const { error: upErr } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(path, strippedBuffer, { contentType: mime, upsert: false });
      if (upErr) throw new Error(`storage upload failed: ${upErr.message}`);
      return admin.storage.from(CERTIFICATE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
    };

    // 最大 UPLOAD_CONCURRENCY 枚ずつ処理してメモリを抑える。
    // ponytail: 途中の storage.upload が throw した場合、成功済みの blob は
    // Storage に孤児として残り得る（全ロールバックはしない）。ただし保存されるのは
    // GPS 除去済みのバイトのみ（漏洩なし）。クライアントは保存確定時に一括アップロード
    // するため発生は稀。増えるようなら未参照 blob を回収する GC cron を追加する。
    const urls: string[] = [];
    for (let i = 0; i < files.length; i += UPLOAD_CONCURRENCY) {
      const chunk = files.slice(i, i + UPLOAD_CONCURRENCY);
      urls.push(...(await Promise.all(chunk.map(uploadOne))));
    }
    return apiOk({ urls });
  } catch (err) {
    if (err instanceof UploadRejected) return apiValidationError(err.message);
    return apiInternalError(err, "POST /api/admin/inspection-records/images");
  }
}

/** 入力起因の拒否（4xx にマップする）。 */
class UploadRejected extends Error {}
