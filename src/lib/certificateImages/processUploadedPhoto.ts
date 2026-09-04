/**
 * 証明書写真1枚を「ハッシュ→GPS除去→TSA封印→検証プロバイダ→保存→バリアント→
 * グレード→certificate_images へ INSERT」まで処理する共有パイプライン。
 *
 * cookie セッション経路 (`/api/certificates/images/upload`) と、モバイル Bearer 経路
 * (`/api/mobile/certificates/images/upload`) の両方から呼ばれ、真正性ロジックが
 * 2 実装に分岐（drift）しないよう単一の関数に集約する。
 *
 * 端末アテステーションと単回nonceは「1撮影セッション=1トークン/1nonce」でリクエスト
 * 単位に1回だけ検証・消費する前提のため、その結果 (`attestation`/`nonceOk`/`nonceResult`)
 * は呼び出し側が算出して渡す。写真TSAはバッチ全体の時間予算 (`tsaBudget`) を共有し、
 * 本関数が読み書きして「遅い/不達なら以降スキップ」を実現する。
 */

import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { hashSha256, computePerceptualHash } from "@/lib/anchoring/imageHashing";
import { stripGpsAndReadExif } from "@/lib/anchoring/imageExif";
import { checkPhotoLocation } from "@/lib/geo/photoLocationCheck";
import { verifyExternalC2pa } from "@/lib/anchoring/providers/c2paVerify";
import { computeAuthenticityGrade } from "@/lib/anchoring/authenticityGrade";
import { invokeAllUploadProviders } from "@/lib/anchoring/providers";
import type { DeviceAttestationResult } from "@/lib/anchoring/providers/types";
import { requestPhotoTimestamp } from "@/lib/anchoring/providers/photoTsa";
import { deriveCaptureBindingReason } from "@/lib/anchoring/captureBindingReason";
import type { ConsumeNonceResult } from "@/lib/certificates/captureNonce";
import { generateImageVariants, variantStoragePath } from "@/lib/certificateImages/generateVariants";
import { upsertVehiclePassport } from "@/lib/passport/upsertVehiclePassport";

type TenantAdmin = ReturnType<typeof createTenantScopedAdmin>["admin"];

/** バッチ全体で共有する写真TSAの時間予算（可変・本関数が読み書きする）。 */
export interface TsaBatchBudget {
  enabled: boolean;
  limitMs: number;
  spentMs: number;
  gaveUp: boolean;
}

/** リクエスト単位で確定する撮影束縛コンテキスト（全写真で共有）。 */
export interface CaptureContext {
  attestation: DeviceAttestationResult;
  nonceOk: boolean;
  nonceResult: ConsumeNonceResult | null;
  captureNonce?: string;
  deviceToken?: string;
}

export interface ProcessPhotoParams {
  admin: TenantAdmin;
  tenantId: string;
  certId: string;
  publicId: string;
  stage: string;
  /** 検証済みの画像バイトと MIME（呼び出し側で magic-byte 検証済み）。 */
  buffer: Buffer;
  mime: string;
  fileName: string | null;
  /** photos 配列内の位置（storage path の一意化とフォールバック名に使用）。 */
  index: number;
  /** certificate_images.sort_order に入れる値。 */
  sortOrder: number;
  /** 証明書対象車両の VIN（C2PA manifest に束縛封入。無ければ封入しない）。 */
  vin?: string | null;
  /** 写真GPS整合チェックの基準となる店舗座標（無ければ no_reference）。生座標は保存しない。 */
  storeCoords?: { lat: number; lng: number } | null;
  /** 出張作業場所の基準座標（証明書に紐づく予約の作業GPS）。無ければ店舗のみで照合。生座標は保存しない。 */
  worksiteCoords?: { lat: number; lng: number } | null;
  capture: CaptureContext;
  tsaBudget: TsaBatchBudget;
}

export type ProcessPhotoResult =
  | { ok: true; id: string; fileName: string | null }
  | { ok: false; code: "internal_error" | "db_error"; message: string };

export async function processUploadedPhoto(params: ProcessPhotoParams): Promise<ProcessPhotoResult> {
  const {
    admin,
    tenantId,
    certId,
    publicId,
    stage,
    buffer,
    mime,
    fileName,
    index,
    sortOrder,
    vin,
    storeCoords,
    worksiteCoords,
    capture,
    tsaBudget,
  } = params;
  const { attestation, nonceOk, nonceResult, captureNonce, deviceToken } = capture;

  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const storagePath = `${tenantId}/${certId}/${Date.now()}_${index}.${ext}`;

  // 除去前ハッシュ（原本照合用。GPS除去で失われる as-captured バイトの SHA-256）。
  const originalSha256 = hashSha256(buffer);

  // 外部C2PA検証は **strip/再エンコード前の原バイト** に対して行う（再エンコードで外部
  // マニフェストが失われ dataHash も壊れるため）。fail-open（未対応/エラーは present=false）。
  const externalC2pa = await verifyExternalC2pa(buffer, mime);

  // GPS/EXIF 除去（失敗時は元バッファへフォールバックし upload を止めない）。
  const exif = await stripGpsAndReadExif(buffer);
  const uploadBuffer = exif.strippedBuffer;

  // 写真GPS × 店舗位置の整合性チェック。生座標(exif.gps)はここで照合してすぐ捨て、
  // 結果(verdict / 距離帯)だけを DB に保存する（プライバシー方針: 生座標は永続化しない）。
  const gpsCheck = checkPhotoLocation({
    photo: exif.gps,
    store: storeCoords ?? null,
    worksite: worksiteCoords ?? null,
  });

  const sha256 = hashSha256(uploadBuffer);
  let perceptualHash: string | null = null;
  try {
    perceptualHash = await computePerceptualHash(uploadBuffer);
  } catch (err) {
    console.warn("[upload] perceptual hash failed", err);
  }

  // 撮影時封印: RFC3161 TSA。バッチ全体の時間予算を共有し、失敗/累計超過で以降は打ち切る。
  let tsa: Awaited<ReturnType<typeof requestPhotoTimestamp>> = null;
  if (tsaBudget.enabled && !tsaBudget.gaveUp) {
    const startedAt = Date.now();
    tsa = await requestPhotoTimestamp(sha256);
    tsaBudget.spentMs += Date.now() - startedAt;
    if (!tsa || tsaBudget.spentMs >= tsaBudget.limitMs) tsaBudget.gaveUp = true;
  }

  // 検証プロバイダ（署名は保存前）。cert/nonce/TSA時刻を C2PA manifest に封入。
  const providers = await invokeAllUploadProviders(
    uploadBuffer,
    mime,
    sha256,
    {
      publicId,
      vin: vin ?? null,
      captureNonce,
      tsaTimestamp: tsa?.timestampAt ?? null,
    },
    // C2PA の行為台帳が「実際に効果のあった変換」だけを主張するよう、per-action の
    // 結果を伝える。reencoded=false は sharp 失敗の fallback（原本をそのまま署名）。
    {
      reencoded: exif.reencoded,
      orientationApplied: exif.orientationApplied,
      metadataRemoved: exif.metadataRemoved,
    },
  );

  const finalBuffer = providers.c2pa.signedBuffer ?? uploadBuffer;

  const { error: uploadError } = await admin.storage
    .from(CERTIFICATE_IMAGE_BUCKET)
    .upload(storagePath, finalBuffer, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("storage upload error", uploadError);
    return {
      ok: false,
      code: "internal_error",
      message: `ストレージへの保存に失敗しました: ${uploadError.message ?? "unknown"}`,
    };
  }

  // WebP バリアント（best-effort。失敗しても本体 upload はブロックしない）。
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
  // 撮影時封印: 本番C2PA or TSA（dev-signed は信頼チェーン無しなので封印に数えない）。
  const sealOk = (providers.c2pa.verified && c2paMode === "production") || !!tsa;
  const grade = computeAuthenticityGrade({
    hasSha256: true,
    hasC2pa: providers.c2pa.verified,
    c2paKind: c2paMode === "disabled" ? "none" : c2paMode,
    hasTsa: !!tsa,
    deviceOk: attestation.verified,
    nonceOk,
    deepfakeOk:
      providers.deepfake.verdict === "likely_real" ? true : providers.deepfake.verdict === "likely_fake" ? false : null,
  });

  const captureBindingReason = deriveCaptureBindingReason({
    hasDeviceToken: !!deviceToken,
    hasNonce: !!captureNonce,
    deviceVerified: attestation.verified,
    nonceResult,
    sealOk,
  });

  const fileNameToStore = fileName || `photo_${index + 1}.${ext}`;
  const { data: insertedRow, error: insertError } = await admin
    .from("certificate_images")
    .insert({
      certificate_id: certId,
      tenant_id: tenantId,
      storage_path: storagePath,
      file_name: fileNameToStore,
      content_type: mime,
      file_size: finalBuffer.length,
      sort_order: sortOrder,
      stage,
      sha256,
      original_sha256: originalSha256,
      perceptual_hash: perceptualHash,
      exif_captured_at: exif.capturedAt ? exif.capturedAt.toISOString() : null,
      exif_device_model: exif.deviceModel,
      exif_gps_stripped: exif.gpsStripped,
      // 写真GPS × 店舗位置の整合性チェック結果のみ（生座標は保存しない）。
      gps_check_verdict: gpsCheck.verdict,
      gps_distance_bucket: gpsCheck.distanceBucket,
      capture_nonce: captureNonce ?? null,
      device_attestation_token_hash: deviceToken ? hashSha256(Buffer.from(deviceToken)) : null,
      // bytea は PostgREST 経由の JSON では `\x<hex>` リテラルで渡す。
      tsa_token: tsa?.token ? `\\x${tsa.token.toString("hex")}` : null,
      tsa_authority: tsa?.authority ?? null,
      tsa_timestamp_at: tsa?.timestampAt ?? null,
      capture_binding_reason: captureBindingReason,
      c2pa_manifest_cid: providers.c2pa.manifestCid,
      c2pa_verified: providers.c2pa.verified,
      // 署名マニフェストの要約（署名者モード・actions台帳・封入値の要約）。生のnonceは含めない。
      c2pa_manifest: providers.c2pa.manifestSummary,
      // 外部（カメラ/他アプリ）C2PA検証（原バイトに対して実施）。マニフェスト有無・有効性・署名者。
      external_c2pa_present: externalC2pa.present,
      external_c2pa_verified: externalC2pa.verified,
      external_c2pa_signer: externalC2pa.signer,
      device_attestation_provider: attestation.provider,
      device_attestation_verified: attestation.verified,
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
    // 孤児ストレージを残さないよう本体＋バリアントを best-effort で削除。
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
    return {
      ok: false,
      code: "db_error",
      message: `データベースへの登録に失敗しました: ${insertError.message ?? "unknown"}`,
    };
  }

  // Polygon アンカー時は VIN 単位の車両パスポートを upsert（fire-and-forget）。
  if (providers.polygon.anchored) {
    upsertVehiclePassport(certId).catch((err: unknown) => {
      console.warn("[passport] upsert failed after anchor", err instanceof Error ? err.message : err);
    });
  }

  return {
    ok: true,
    id: insertedRow?.id as string,
    fileName: (insertedRow?.file_name as string | null) ?? null,
  };
}
