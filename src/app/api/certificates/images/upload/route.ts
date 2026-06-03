import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { apiError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hashSha256, computePerceptualHash } from "@/lib/anchoring/imageHashing";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";
import { computeAuthenticityGrade } from "@/lib/anchoring/authenticityGrade";
import { invokeAllUploadProviders } from "@/lib/anchoring/providers";
import { upsertVehiclePassport } from "@/lib/passport/upsertVehiclePassport";
import { generateImageVariants, variantStoragePath } from "@/lib/certificateImages/generateVariants";
import { maybeAutoTamperingCheckForCertificate } from "@/lib/ai/automation/photoTamperingAuto";

export const runtime = "nodejs";
// Allow up to 60s for image processing + verification providers.
// Without this, Vercel Hobby caps at 10s and slow providers (polygon
// anchoring, deepfake detection) can cause a 504 HTML response, which
// the client sees as a generic "アップロードに失敗しました" error.
export const maxDuration = 60;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

/** Validate file magic bytes against allowed image types */
function validateMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }
  // HEIF/HEIC: check for 'ftyp' box at offset 4, then 'heic', 'heix', 'hevc', 'mif1'
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "mif1"].includes(brand)) {
      return "image/heic";
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit: 20 uploads per user per minute ───────────────
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    // ── Auth (resolveCallerWithRole for proper tenant isolation) ──
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    const tenantId = caller.tenantId;

    // ── Plan tier → photo limit ───────────────────────────────────
    const { data: tenant } = await supabase
      .from("tenants")
      .select("plan_tier")
      .eq("id", tenantId)
      .single<{ plan_tier: string | null }>();
    const planTier = normalizePlanTier(tenant?.plan_tier);
    const maxPhotos = PHOTO_LIMITS[planTier];

    // ── Parse multipart form ──────────────────────────────────────
    const form = await req.formData();
    let publicId = String(form.get("public_id") ?? "").trim();
    const certIdemKey = String(form.get("cert_idempotency_key") ?? "").trim();

    // public_id が無く cert_idempotency_key だけある場合 (オフライン同期時の
    // 写真 upload) は永続マッピング表から逆引きする。これで cert 作成と
    // 画像 upload の連鎖実行が IP/network 変化後も成立する。
    if (!publicId && certIdemKey) {
      const { lookupCertByIdempotencyKey } = await import("@/lib/certificates/idempotencyMap");
      const mapped = await lookupCertByIdempotencyKey(certIdemKey, caller.tenantId);
      if (!mapped) {
        // cert 作成が先に成功している必要がある。drainOutbox 順序を保つには
        // 425 Too Early を返して再試行を待たせる。
        return apiError({
          code: "validation_error",
          message:
            "cert_idempotency_key に対応する証明書がまだ存在しません。先に証明書作成リクエストの同期を完了してください。",
          status: 425,
        });
      }
      publicId = mapped.public_id;
    }

    if (!publicId) {
      return apiValidationError("public_id または cert_idempotency_key のいずれかが必須です。");
    }

    const files = form.getAll("photos") as File[];
    if (files.length === 0) {
      return apiOk({ uploaded: 0 });
    }

    // ── Verify certificate belongs to this tenant ─────────────────
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: cert } = await admin
      .from("certificates")
      .select("id, tenant_id")
      .eq("public_id", publicId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!cert?.id) {
      return apiNotFound("証明書が見つかりません。");
    }

    // ── Count existing images ─────────────────────────────────────
    const { count: existingCount } = await admin
      .from("certificate_images")
      .select("id", { count: "exact", head: true })
      .eq("certificate_id", cert.id);
    const existing = existingCount ?? 0;
    const remaining = maxPhotos - existing;

    if (remaining <= 0) {
      return apiError({
        code: "plan_limit",
        message: "写真の上限に達しました。",
        status: 422,
        data: { max: maxPhotos, plan: planTier },
      });
    }

    // ── Upload files ───────────────────────────────────────────────
    const toUpload = files.slice(0, remaining);
    let uploaded = 0;
    /**
     * 成功した画像を返す。`upload_index` はクライアントが送信した
     * `photos` 配列内の位置 (0-origin) で、ファイル名が重複した場合でも
     * 注釈の post-upload 適用を index ベースで一意に紐付けるために使う。
     */
    const uploadedImages: { id: string; file_name: string | null; upload_index: number }[] = [];
    // Capture the last failure so we can return a specific error to the
    // client instead of a generic "invalid format or size" message.
    let lastFailure: { code: "validation_error" | "db_error" | "internal_error"; message: string } | null = null;

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      if (!file || !file.size) continue;

      // Validate size
      if (file.size > MAX_FILE_BYTES) {
        lastFailure = {
          code: "validation_error",
          message: `ファイルサイズが大きすぎます（上限 ${MAX_FILE_BYTES / 1024 / 1024}MB）。`,
        };
        continue;
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate magic bytes (not client-provided MIME)
      const detectedMime = validateMagicBytes(buffer);
      if (!detectedMime) {
        lastFailure = {
          code: "validation_error",
          message: "対応していないファイル形式です（JPEG・PNG・WebP・HEIC のみ）。",
        };
        continue;
      }

      const mime = detectedMime;
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      const storagePath = `${tenantId}/${cert.id}/${Date.now()}_${i}.${ext}`;

      // ── Phase 1: hash + strip EXIF/GPS ─────────────────────────
      // Any failure here falls back to the original buffer so a
      // flaky sharp binding never blocks a legitimate upload.
      const exif = await stripGpsAndReadExif(buffer);
      const uploadBuffer = exif.strippedBuffer;

      const sha256 = hashSha256(uploadBuffer);
      let perceptualHash: string | null = null;
      try {
        perceptualHash = await computePerceptualHash(uploadBuffer);
      } catch (err) {
        console.warn("[upload] perceptual hash failed", err);
      }

      // ── Phase 3a+3b: verification providers (sign before upload) ──
      const providers = await invokeAllUploadProviders(uploadBuffer, mime, sha256);

      // If C2PA signed, use the signed buffer (manifest embedded) for storage
      const finalBuffer = providers.c2pa.signedBuffer ?? uploadBuffer;

      const { error: uploadError } = await admin.storage
        .from(CERTIFICATE_IMAGE_BUCKET)
        .upload(storagePath, finalBuffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadError) {
        console.error("storage upload error", uploadError);
        lastFailure = {
          code: "internal_error",
          message: `ストレージへの保存に失敗しました: ${uploadError.message ?? "unknown"}`,
        };
        continue;
      }

      // ── WebP variants (best-effort, never blocks primary upload) ──
      // The original is already in storage; if variant encoding or upload
      // fails, the row is inserted with NULL variant paths and consumers
      // fall back to `storage_path`. See lib/certificateImages/generateVariants.
      let thumbnailPath: string | null = null;
      let mediumPath: string | null = null;
      const variants = await generateImageVariants(finalBuffer);
      if (variants.thumbnail) {
        const path = variantStoragePath(storagePath, "thumbnail");
        const { error: vErr } = await admin.storage
          .from(CERTIFICATE_IMAGE_BUCKET)
          .upload(path, variants.thumbnail.buffer, { contentType: "image/webp", upsert: false });
        if (vErr) console.warn("thumbnail variant upload failed", { path, message: vErr.message });
        else thumbnailPath = path;
      }
      if (variants.medium) {
        const path = variantStoragePath(storagePath, "medium");
        const { error: vErr } = await admin.storage
          .from(CERTIFICATE_IMAGE_BUCKET)
          .upload(path, variants.medium.buffer, { contentType: "image/webp", upsert: false });
        if (vErr) console.warn("medium variant upload failed", { path, message: vErr.message });
        else mediumPath = path;
      }

      const c2paMode = (process.env.C2PA_MODE ?? "disabled") as "disabled" | "dev-signed" | "production";
      const grade = computeAuthenticityGrade({
        hasSha256: true,
        hasExif: exif.gpsStripped,
        hasC2pa: providers.c2pa.verified,
        c2paKind: c2paMode === "disabled" ? "none" : c2paMode,
        deviceOk: providers.deviceAttestation.verified,
        deepfakeOk:
          providers.deepfake.verdict === "likely_real"
            ? true
            : providers.deepfake.verdict === "likely_fake"
              ? false
              : null,
      });

      const fileNameToStore = file.name || `photo_${i + 1}.${ext}`;
      const { data: insertedRow, error: insertError } = await admin
        .from("certificate_images")
        .insert({
          certificate_id: cert.id,
          tenant_id: tenantId,
          storage_path: storagePath,
          file_name: fileNameToStore,
          content_type: mime,
          file_size: finalBuffer.length,
          sort_order: existing + uploaded,
          sha256,
          perceptual_hash: perceptualHash,
          exif_captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null,
          exif_device_model: exif.deviceModel,
          exif_gps_stripped: exif.gpsStripped,
          c2pa_manifest_cid: providers.c2pa.manifestCid,
          c2pa_verified: providers.c2pa.verified,
          device_attestation_provider: providers.deviceAttestation.provider,
          device_attestation_verified: providers.deviceAttestation.verified,
          deepfake_score: providers.deepfake.score,
          deepfake_verdict: providers.deepfake.verdict,
          polygon_tx_hash: providers.polygon.txHash,
          polygon_network: providers.polygon.network,
          authenticity_grade: grade,
          thumbnail_path: thumbnailPath,
          medium_path: mediumPath,
        })
        .select("id, file_name")
        .single();

      if (insertError) {
        console.error("certificate_images insert error", insertError);
        // Best-effort: remove the primary object AND any variants so we
        // don't orphan paid storage. Failures here surface loudly because
        // the bytes are unreachable from the application path forever.
        const pathsToRemove = [storagePath];
        if (thumbnailPath) pathsToRemove.push(thumbnailPath);
        if (mediumPath) pathsToRemove.push(mediumPath);
        admin.storage
          .from(CERTIFICATE_IMAGE_BUCKET)
          .remove(pathsToRemove)
          .catch((removeErr: unknown) => {
            console.error("certificate_images orphan cleanup failed", {
              storagePath,
              variantPaths: pathsToRemove.slice(1),
              insertError: insertError.message,
              removeError: removeErr instanceof Error ? removeErr.message : String(removeErr),
            });
          });
        lastFailure = {
          code: "db_error",
          message: `データベースへの登録に失敗しました: ${insertError.message ?? "unknown"}`,
        };
        continue;
      }

      // If this image was anchored to Polygon, update (or create) the vehicle
      // passport for this VIN. Fire-and-forget: a failure here must never
      // surface as an upload error to the end user.
      if (providers.polygon.anchored) {
        upsertVehiclePassport(cert.id).catch((err: unknown) => {
          console.warn("[passport] upsert failed after anchor", err instanceof Error ? err.message : err);
        });
      }

      if (insertedRow?.id) {
        uploadedImages.push({
          id: insertedRow.id as string,
          file_name: (insertedRow.file_name as string | null) ?? null,
          upload_index: i,
        });
      }

      uploaded++;
    }

    if (uploaded === 0) {
      return apiError({
        code: lastFailure?.code ?? "validation_error",
        message:
          lastFailure?.message ??
          "写真のアップロードに失敗しました。ファイル形式（JPEG・PNG・WebP・HEIC）またはサイズ（上限20MB）を確認してください。",
        status: 422,
      });
    }

    // opt-in テナントでは、写真追加後に改ざんスクリーニングを自動実行する
    // (fire-and-forget / レスポンス後 / 既存シグナルの集約のみで AI 課金なし)。
    after(() => maybeAutoTamperingCheckForCertificate({ tenantId, certificateId: cert.id as string }));

    return apiOk({ uploaded, max: maxPhotos, plan: planTier, images: uploadedImages });
  } catch (e) {
    return apiInternalError(e, "image upload");
  }
}
