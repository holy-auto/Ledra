/**
 * 証明書写真アップロードの共通オーケストレーション（認証後）。
 *
 * cookie 経路 (`/api/certificates/images/upload`) とモバイル Bearer 経路
 * (`/api/mobile/certificates/images/upload`) が、認証方式だけ差し替えて同一の
 * フォーム解析・プラン上限・cert 照合・撮影束縛検証・写真処理（processUploadedPhoto）・
 * 後処理 (after) を共有する。真正性ロジックの drift を防ぐ単一の入口。
 */

import { after, type NextRequest } from "next/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { normalizePlanTier, PHOTO_LIMITS } from "@/lib/billing/planFeatures";
import { getCachedTenantBilling } from "@/lib/billing/tenantBillingCache";
import { apiOk, apiError, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { isPhotoTsaEnabled } from "@/lib/anchoring/providers/photoTsa";
import { verifyDeviceAttestation } from "@/lib/anchoring/providers/deviceAttestation";
import { consumeCaptureNonce, type ConsumeNonceResult } from "@/lib/certificates/captureNonce";
import { processUploadedPhoto } from "@/lib/certificateImages/processUploadedPhoto";
import { maybeAutoTamperingCheckForCertificate } from "@/lib/ai/automation/photoTamperingAuto";
import { maybeAutoQualityCheckForCertificate } from "@/lib/ai/automation/photoQualityAuto";
import { maybeAutoClassifyStageForCertificate } from "@/lib/ai/automation/photoStageClassifyAuto";
import { maybeAutoWorkStampForCertificate } from "@/lib/ai/automation/workStampAuto";
import { maybeAutoDraftContentForCertificate } from "@/lib/ai/automation/photoContentDraftAuto";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { detectMagicByteMime } from "@/lib/media/magicBytes";

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

/** Validate file magic bytes against allowed image types (JPEG/PNG/WebP/HEIC). */
function validateMagicBytes(buffer: Buffer): string | null {
  const mime = detectMagicByteMime(buffer);
  return mime === "image/jpeg" || mime === "image/png" || mime === "image/webp" || mime === "image/heic" ? mime : null;
}

/**
 * 認証済みテナントの証明書に写真をアップロードする共通処理。呼び出し側は認証・レート制限を
 * 済ませたうえで tenantId を渡す。Response を返す。
 */
export async function handleCertificateImageUpload(req: NextRequest, tenantId: string): Promise<Response> {
  try {
    // ── Plan tier → photo limit（billing guard と共有の 60 秒キャッシュ）──
    const billing = await getCachedTenantBilling(tenantId);
    const planTier = normalizePlanTier(billing?.plan_tier ?? null);
    const maxPhotos = PHOTO_LIMITS[planTier];

    // ── Parse multipart form ──────────────────────────────────────
    const form = await req.formData();
    let publicId = String(form.get("public_id") ?? "").trim();
    const certIdemKey = String(form.get("cert_idempotency_key") ?? "").trim();

    // 撮影時来歴:
    //   device_token    … 端末アテステーショントークン（Play Integrity / App Attest）
    //   device_provider … "play_integrity" | "app_attest"
    //   capture_nonce   … cert 作成時にサーバ発行した単回撮影nonce
    // 未送信（Web/ギャラリー/レガシー）なら空文字 → 非担保（basic）のまま。
    const deviceToken = String(form.get("device_token") ?? "").trim() || undefined;
    const deviceProvider = String(form.get("device_provider") ?? "").trim() || undefined;
    const captureNonce = String(form.get("capture_nonce") ?? "").trim() || undefined;

    // 車体整備ガイドライン4.2(1): 撮影段階のタグ (任意。未指定は 'unspecified')。
    const STAGE_VALUES = ["intake_before", "in_progress", "after", "unspecified"] as const;
    const rawStage = String(form.get("stage") ?? "").trim();
    const stage = (STAGE_VALUES as readonly string[]).includes(rawStage) ? rawStage : "unspecified";

    // public_id が無く cert_idempotency_key だけある場合 (オフライン同期時の写真 upload) は
    // 永続マッピング表から逆引きする。cert 作成と画像 upload の連鎖が IP/network 変化後も成立。
    if (!publicId && certIdemKey) {
      const { lookupCertByIdempotencyKey } = await import("@/lib/certificates/idempotencyMap");
      const mapped = await lookupCertByIdempotencyKey(certIdemKey, tenantId);
      if (!mapped) {
        // cert 作成が先に成功している必要がある。drainOutbox 順序を保つには 425 で再試行を待たせる。
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
    const { admin } = createTenantScopedAdmin(tenantId);
    const { data: cert } = await admin
      .from("certificates")
      .select("id, tenant_id, vehicle_id")
      .eq("public_id", publicId)
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();
    if (!cert?.id) {
      return apiNotFound("証明書が見つかりません。");
    }
    const certId = cert.id as string;

    // C2PA manifest に封入する車両 VIN を 1 リクエストにつき 1 回だけ解決する
    // (署名が別車両の証明書へ流用されるのを防ぐ束縛。無ければ封入しないだけ)。
    let vin: string | null = null;
    if (cert.vehicle_id) {
      const { data: vehicle } = await admin
        .from("vehicles")
        .select("vin_code")
        .eq("id", cert.vehicle_id as string)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      vin = (vehicle?.vin_code as string | null)?.trim() || null;
    }

    // ── Count existing images ─────────────────────────────────────
    const { count: existingCount } = await admin
      .from("certificate_images")
      .select("id", { count: "exact", head: true })
      .eq("certificate_id", certId);
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

    // ── 撮影時来歴の request-level 検証（1撮影セッション=1トークン/1nonce）──
    const attestation = await verifyDeviceAttestation(deviceToken, {
      provider: deviceProvider,
      expectedNonce: captureNonce,
    });
    // nonce は cert 束縛の行ロックで単回消費。1リクエスト内の全写真がこのセッション nonce を共有。
    // ponytail: 全ファイルが後段で検証落ちしても nonce は消費される（同 cert の再送は
    // consumed → basic）。実害は「不正アップロードで nonce を1つ焼く」程度で稀、担保も弱めない。
    const nonceResult: ConsumeNonceResult | null = captureNonce
      ? await consumeCaptureNonce({
          nonce: captureNonce,
          tenantId,
          certificateId: certId,
          deviceKeyHash: attestation.deviceKeyHash,
        })
      : null;
    const nonceOk = nonceResult === "ok";

    // ── Upload files ───────────────────────────────────────────────
    const toUpload = files.slice(0, remaining);
    let uploaded = 0;
    const uploadedImages: { id: string; file_name: string | null; upload_index: number }[] = [];
    let lastFailure: { code: "validation_error" | "db_error" | "internal_error"; message: string } | null = null;

    // 写真 TSA のリクエスト全体予算。processUploadedPhoto がこの予算を共有し、失敗/累計超過で
    // 以降の写真は TSA を打ち切って封印なしで続行する（fail-open / 504 防止）。
    const tsaBudget = { enabled: isPhotoTsaEnabled(), limitMs: 15_000, spentMs: 0, gaveUp: false };

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      if (!file || !file.size) continue;

      if (file.size > MAX_FILE_BYTES) {
        lastFailure = {
          code: "validation_error",
          message: `ファイルサイズが大きすぎます（上限 ${MAX_FILE_BYTES / 1024 / 1024}MB）。`,
        };
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());

      // Validate magic bytes (not client-provided MIME).
      const detectedMime = validateMagicBytes(buffer);
      if (!detectedMime) {
        lastFailure = {
          code: "validation_error",
          message: "対応していないファイル形式です（JPEG・PNG・WebP・HEIC のみ）。",
        };
        continue;
      }

      const result = await processUploadedPhoto({
        admin,
        tenantId,
        certId,
        publicId,
        stage,
        buffer,
        mime: detectedMime,
        fileName: file.name || null,
        index: i,
        sortOrder: existing + uploaded,
        vin,
        capture: { attestation, nonceOk, nonceResult, captureNonce, deviceToken },
        tsaBudget,
      });

      if (!result.ok) {
        lastFailure = { code: result.code, message: result.message };
        continue;
      }

      uploadedImages.push({ id: result.id, file_name: result.fileName, upload_index: i });
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

    // 写真追加後に改ざんスクリーニング → 品質監査を after() で **順次** 実行
    // (fire-and-forget / レスポンス後 / 注釈のみ)。両者とも certificates.meta を read-merge-write
    // するため、順次にして後者が前者の書き込み後の meta を読み直す。
    after(async () => {
      await maybeAutoTamperingCheckForCertificate({ tenantId, certificateId: certId });
      await maybeAutoQualityCheckForCertificate({ tenantId, certificateId: certId });
      // 未タグ写真の before/after 自動分類 (提案を meta.stage_suggestions に保存)。
      // 別 meta キーだが順次にして最新 meta を読み直す。
      await maybeAutoClassifyStageForCertificate({ tenantId, certificateId: certId });
      // 写真打刻: EXIF 撮影時刻 → 施工日 / 作業時間 (提案を meta.work_stamp に保存)。
      // LLM 不使用で無料。別 meta キーだが順次にして最新 meta を読み直す。
      await maybeAutoWorkStampForCertificate({ tenantId, certificateId: certId });
      // 施工内容ドラフト: 代表写真を Vision で読み取り施工内容の下書きを提案
      // (meta.content_draft_suggestion)。証明書単位で1度だけ・opt-in・提案のみ。
      await maybeAutoDraftContentForCertificate({ tenantId, certificateId: certId });
    });
    // 画像追加で image_sha256_set が変わるため新しい digest を anchor queue に積む（best-effort）。
    enqueueCertificateAnchor({ tenantId, certificateId: certId }).catch(() => {});

    return apiOk({ uploaded, max: maxPhotos, plan: planTier, images: uploadedImages });
  } catch (e) {
    return apiInternalError(e, "image upload");
  }
}
