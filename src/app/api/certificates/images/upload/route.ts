import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";
import { getCachedTenantBilling } from "@/lib/billing/tenantBillingCache";
import { apiOk, apiInternalError, apiUnauthorized, apiValidationError, apiNotFound } from "@/lib/api/response";
import { apiError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { hashSha256, computePerceptualHash } from "@/lib/anchoring/imageHashing";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";
import { computeAuthenticityGrade } from "@/lib/anchoring/authenticityGrade";
import { invokeAllUploadProviders } from "@/lib/anchoring/providers";
import { requestPhotoTimestamp } from "@/lib/anchoring/providers/photoTsa";
import { upsertVehiclePassport } from "@/lib/passport/upsertVehiclePassport";
import { generateImageVariants, variantStoragePath } from "@/lib/certificateImages/generateVariants";
import { maybeAutoTamperingCheckForCertificate } from "@/lib/ai/automation/photoTamperingAuto";
import { maybeAutoQualityCheckForCertificate } from "@/lib/ai/automation/photoQualityAuto";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { detectMagicByteMime } from "@/lib/media/magicBytes";

export const runtime = "nodejs";
// Allow up to 60s for image processing + verification providers.
// Without this, Vercel Hobby caps at 10s and slow providers (polygon
// anchoring, deepfake detection) can cause a 504 HTML response, which
// the client sees as a generic "アップロードに失敗しました" error.
export const maxDuration = 60;

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

/** Validate file magic bytes against allowed image types (JPEG/PNG/WebP/HEIC) */
function validateMagicBytes(buffer: Buffer): string | null {
  const mime = detectMagicByteMime(buffer);
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/heic" ? mime : null;
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
    // plan_tier は billing guard と共有の 60 秒キャッシュから取得 (重複クエリを排除)。
    const billing = await getCachedTenantBilling(tenantId);
    const planTier = normalizePlanTier(billing?.plan_tier ?? null);
    const maxPhotos = PHOTO_LIMITS[planTier];

    // ── Parse multipart form ──────────────────────────────────────
    const form = await req.formData();
    let publicId = String(form.get("public_id") ?? "").trim();
    const certIdemKey = String(form.get("cert_idempotency_key") ?? "").trim();

    // 撮影時来歴（Phase 1 では純配線・グレードは動かない）:
    //   device_token  … 端末アテステーショントークン（Play Integrity / App Attest）
    //   capture_nonce … cert 作成時にサーバ発行した単回撮影nonce
    // 未送信（Web/ギャラリー/レガシー）なら空文字 → 非担保（basic）のまま。
    const deviceToken = String(form.get("device_token") ?? "").trim() || undefined;
    const captureNonce = String(form.get("capture_nonce") ?? "").trim() || undefined;

    // 車体整備ガイドライン4.2(1): 撮影段階のタグ (任意。未指定は 'unspecified')。
    const STAGE_VALUES = ["intake_before", "in_progress", "after", "unspecified"] as const;
    const rawStage = String(form.get("stage") ?? "").trim();
    const stage = (STAGE_VALUES as readonly string[]).includes(rawStage) ? rawStage : "unspecified";

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

      // Original (pre-strip) hash: EXIF/GPS is stripped for privacy before
      // storage, which destroys the as-captured bytes. Recording their SHA-256
      // lets a dispute later verify a customer-supplied original without us
      // ever storing the location-bearing original. Computed on the raw buffer.
      const originalSha256 = hashSha256(buffer);

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

      // Capture-time seal: RFC3161 TSA over the stored hash (no-op/null unless
      // PHOTO_TSA_* configured; never blocks the upload).
      const tsa = await requestPhotoTimestamp(sha256);

      // ── Phase 3a+3b: verification providers (sign before upload) ──
      // Pass the device attestation token and seal the capture context
      // (certificate + nonce + TSA time) into the C2PA manifest.
      const providers = await invokeAllUploadProviders(uploadBuffer, mime, sha256, deviceToken, {
        publicId,
        captureNonce,
        tsaTimestamp: tsa?.timestampAt ?? null,
      });

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
      // Phase 1 is pure plumbing: device attestation is still a stub (deviceOk
      // always false) so captureBindingOk is false and every row stays `basic`.
      // Phase 2 wires real attestation + `consumeCaptureNonce` to set nonceOk.
      const grade = computeAuthenticityGrade({
        hasSha256: true,
        hasC2pa: providers.c2pa.verified,
        c2paKind: c2paMode === "disabled" ? "none" : c2paMode,
        hasTsa: !!tsa,
        deviceOk: providers.deviceAttestation.verified,
        nonceOk: false,
        deepfakeOk:
          providers.deepfake.verdict === "likely_real"
            ? true
            : providers.deepfake.verdict === "likely_fake"
              ? false
              : null,
      });

      // 監査用の非担保理由（Phase 1: 端末トークンも nonce も無ければ Web/ギャラリー流用）。
      const captureBindingReason = !deviceToken && !captureNonce ? "gallery_upload" : null;

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
          stage,
          sha256,
          original_sha256: originalSha256,
          perceptual_hash: perceptualHash,
          exif_captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null,
          exif_device_model: exif.deviceModel,
          exif_gps_stripped: exif.gpsStripped,
          capture_nonce: captureNonce ?? null,
          device_attestation_token_hash: deviceToken ? hashSha256(Buffer.from(deviceToken)) : null,
          // bytea は PostgREST 経由の JSON では `\x<hex>` リテラルで渡す（Buffer を
          // そのまま入れると object にシリアライズされ insert が失敗する）。
          tsa_token: tsa?.token ? `\\x${tsa.token.toString("hex")}` : null,
          tsa_authority: tsa?.authority ?? null,
          tsa_timestamp_at: tsa?.timestampAt ?? null,
          capture_binding_reason: captureBindingReason,
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
    // opt-in テナントでは、写真追加後に改ざんスクリーニングと Ledra Standard 品質監査を自動実行する
    // (fire-and-forget / レスポンス後 / 注釈のみ・発行はブロックしない)。両者とも certificates.meta を
    // read-merge-write するため、並列だと一方の結果 (tampering_check / quality_check) が失われ得る。
    // 1 つの after() で **順次** 実行し、後者が前者の書き込み後の meta を読み直してマージする。
    after(async () => {
      await maybeAutoTamperingCheckForCertificate({ tenantId, certificateId: cert.id as string });
      await maybeAutoQualityCheckForCertificate({ tenantId, certificateId: cert.id as string });
    });
    // 画像追加で image_sha256_set が変わるため証明書レコードの新しい digest を anchor
    // queue に積む (best-effort fire-and-forget / CERT_RECORD_ANCHOR_ENABLED=false なら no-op)。
    enqueueCertificateAnchor({ tenantId, certificateId: cert.id as string }).catch(() => {});

    return apiOk({ uploaded, max: maxPhotos, plan: planTier, images: uploadedImages });
  } catch (e) {
    return apiInternalError(e, "image upload");
  }
}
