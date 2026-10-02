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
import { getMode as getC2paMode } from "@/lib/anchoring/providers/c2pa";
import { createC2paSigner } from "@/lib/anchoring/providers/c2paSigner";
import { normalizeStage } from "@/lib/certificateImages/stage";
import { maybeAutoTamperingCheckForCertificate } from "@/lib/ai/automation/photoTamperingAuto";
import { maybeAutoQualityCheckForCertificate } from "@/lib/ai/automation/photoQualityAuto";
import { maybeAutoClassifyStageForCertificate } from "@/lib/ai/automation/photoStageClassifyAuto";
import { maybeAutoWorkStampForCertificate } from "@/lib/ai/automation/workStampAuto";
import { maybeAutoDraftContentForCertificate } from "@/lib/ai/automation/photoContentDraftAuto";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";
import { detectMagicByteMime } from "@/lib/media/magicBytes";
import { watchGateReadyTransition } from "@/lib/certificates/gateReadyNotify";

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
    const stage = normalizeStage(form.get("stage"));

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
      .select("id, tenant_id, vehicle_id, reservation_id, status, service_type")
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

    // 写真GPS整合チェックの基準座標を 1 リクエストにつき 1 回だけ解決する（生座標は保存しない）。
    // ponytail: マルチ店舗テナントは「既定の有効店舗」を基準にする（暫定）。
    //   将来は証明書に紐づく予約の store_id で店舗を特定するのがより正確。
    let storeCoords: { lat: number; lng: number } | null = null;
    {
      const { data: store } = await admin
        .from("stores")
        .select("latitude, longitude")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .not("latitude", "is", null)
        .not("longitude", "is", null)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lat = store?.latitude as number | null | undefined;
      const lng = store?.longitude as number | null | undefined;
      if (typeof lat === "number" && typeof lng === "number") storeCoords = { lat, lng };
    }

    // 出張作業場所の基準座標を、証明書に紐づく予約 (reservation_id) の作業GPSから解決する。
    // 出張現場は店舗から離れるため、作業場所一致 (match_worksite) を「正当」と判定できる。
    let worksiteCoords: { lat: number; lng: number } | null = null;
    if (cert.reservation_id) {
      const { data: rsv } = await admin
        .from("reservations")
        .select("work_lat, work_lng")
        .eq("id", cert.reservation_id as string)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      const lat = rsv?.work_lat as number | null | undefined;
      const lng = rsv?.work_lng as number | null | undefined;
      if (typeof lat === "number" && typeof lng === "number") worksiteCoords = { lat, lng };
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
    // **本番 C2PA の先行検査。** `C2PA_MODE=production` なのに署名器が作れないなら、
    // 1枚も処理せずここで落とす。署名器が作れない原因（モジュール不在・env 未投入・鍵/証明書不正）は
    // 写真に依らず全枚数で同じなので、後段で1枚ずつ弾く意味が無い。**ここより後ろには
    // nonce の単回消費・sharp の再エンコード・TSA・Polygon のオンチェーン送信があり、
    // どれも写真を保存しないのに消費される**（Polygon は不可逆・ガス消費）。
    // /code-review 指摘 #3・#6。
    if (getC2paMode() === "production" && !(await createC2paSigner("production"))) {
      console.error("[c2pa] production signer unavailable — rejecting upload request before any work");
      return apiError({
        code: "internal_error",
        message:
          "写真の来歴署名（C2PA）を行う準備ができていないため、アップロードを受け付けられません。未署名の写真は保存しません。管理者にご連絡ください。",
        status: 503,
      });
    }

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

    // IMP-029 certificate_gate_ready: INSERT 前の Gate 状態を控える（draft かつ未 READY のときだけ
    // 後で再評価する）。遷移検知は gateReadyNotify.ts。失敗してもアップロードは止めない。
    const notifyIfGateBecameReady = await watchGateReadyTransition(admin, tenantId, {
      id: certId,
      public_id: publicId,
      status: (cert.status as string | null) ?? null,
      service_type: (cert.service_type as string | null) ?? null,
      reservation_id: (cert.reservation_id as string | null) ?? null,
    });

    // ── Upload files ───────────────────────────────────────────────
    const toUpload = files.slice(0, remaining);
    let uploaded = 0;
    const uploadedImages: { id: string; file_name: string | null; upload_index: number }[] = [];
    let lastFailure: { code: "validation_error" | "db_error" | "internal_error"; message: string } | null = null;
    // **C2PA 署名の失敗で弾いた写真**。`lastFailure` は uploaded===0 のときしか表に出ないので、
    // これを別に数える。一部成功で 200 を返すと「証明書は揃った」と見えるのに写真が黙って
    // 欠けるため、未署名を黙らせない目的が裏返る（/code-review 指摘 #1）。
    const c2paRefused: number[] = [];

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
        storeCoords,
        worksiteCoords,
        capture: { attestation, nonceOk, nonceResult, captureNonce, deviceToken },
        tsaBudget,
      });

      if (!result.ok) {
        lastFailure = { code: result.code, message: result.message };
        if (result.c2paRefused) c2paRefused.push(i + 1);
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

    // **署名できずに弾いた写真が1枚でもあれば、一部成功でもエラーで返す。** 200 で返すと
    // 「N枚アップロードしました」しか出ず、欠けた写真に誰も気づかない（/code-review 指摘 #1）。
    // 保存済みの写真はそのまま残る（あちらは署名済みなので消す理由が無い）。
    if (c2paRefused.length > 0) {
      return apiError({
        code: "internal_error",
        message: `${uploaded}枚を保存しましたが、${c2paRefused.length}枚（${c2paRefused.join("・")}枚目）は写真の来歴署名（C2PA）に失敗したため保存していません。未署名の写真は保存しません。保存できた写真はそのまま残っています。管理者にご連絡ください。`,
        status: 422,
      });
    }

    // 写真追加で Gate が未 READY→READY に変わったら admin へ通知（レスポンス後・AI 処理とは独立）。
    after(notifyIfGateBecameReady);

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
