/**
 * 証明書写真のアップロード時に改ざんスクリーニングを、人の操作なしで自動実行する IO 層。
 *
 * 写真アップロードルート (`/api/certificates/images/upload` POST) から、レスポンス送出後に
 * `after()` 経由で **fire-and-forget** で呼ばれる (serverless でも完走させる)。
 * after() は auth セッションが切れているため service-role で読み書きし、絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし photo.auto_tampering_check が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_quality_vision) と is_active を確認
 *   3. certificate_images のアップロード時シグナルを集約 (一次判定)
 *   4. DB シグナルだけでは判定不能 (グレーゾーン) な画像のみ Opus Vision で内容審査し折り込む
 *      (画素ベースなので EXIF 除去後でも有効 / 画像ごとに結果をキャッシュし再課金を避ける)
 *   5. verdict を certificates.meta.tampering_check に保存
 *
 * コスト: 一次判定は追加 DL・新規 AI 呼び出しなし。Vision はグレーゾーンの新規画像のみ
 * (master switch / 月次コストキャップ / source_policies.photos に従う)。
 * 壁3 とは無関係 (verdict/flags は注釈のみで、発行・金額・本人確認には不介入)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import {
  aggregateCertificateImageIntegrity,
  applyVisionVerdicts,
  pickGrayZoneImageIds,
  type CertImageIntegrityInput,
  type PhotoIntegrityFlag,
} from "@/lib/ai/certificatePhotoIntegrity";
import { inspectImageTamperingVision } from "@/lib/ai/photoTamperingCheck";
import { modelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoTamperingCheck } from "./orchestrator";

const VISION_ENDPOINT = "/api/certificates/images/upload#auto-tampering-vision";

/** 1 回の実行で Vision 審査するグレーゾーン画像数の上限 (暴走防止)。 */
const MAX_VISION_IMAGES = 6;
/** Anthropic image API が受け付ける media type のみ Vision に回す。 */
const VISION_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** グレーゾーンのフラグを Vision プロンプト用の短句ヒントに変換する。 */
const FLAG_HINT_JA: Record<PhotoIntegrityFlag, string> = {
  duplicate_image: "他の写真とハッシュが重複",
  deepfake_suspected: "ディープフェイク判定が要注意",
  capture_time_future: "撮影日時が未来",
  metadata_missing: "撮影メタ(日時/端末)が欠落",
  vision_suspicious: "内容審査で要注意",
};

export interface MaybeAutoTamperingCheckParams {
  tenantId: string;
  certificateId: string;
}

interface ImageRow extends CertImageIntegrityInput {
  storagePath: string | null;
  contentType: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type VisionVerdict = { suspicious: boolean; reason: string };

/**
 * 指定証明書の写真群に改ざんスクリーニングを自動適用する。失敗しても投げない。
 */
export async function maybeAutoTamperingCheckForCertificate(params: MaybeAutoTamperingCheckParams): Promise<void> {
  const { tenantId, certificateId } = params;
  try {
    if (!tenantId || !certificateId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoTamperingCheck(settings)) return;

    const admin = createServiceRoleAdmin("AI auto tampering check — image upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_quality_vision")) return;

    const { data: rows } = await admin
      .from("certificate_images")
      .select(
        "id, sha256, perceptual_hash, exif_captured_at, exif_device_model, deepfake_verdict, authenticity_grade, storage_path, content_type",
      )
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    const imageRows: ImageRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      sha256: (r.sha256 as string | null) ?? null,
      perceptualHash: (r.perceptual_hash as string | null) ?? null,
      capturedAt: (r.exif_captured_at as string | null) ?? null,
      deviceModel: (r.exif_device_model as string | null) ?? null,
      deepfakeVerdict: (r.deepfake_verdict as string | null) ?? null,
      authenticityGrade: (r.authenticity_grade as string | null) ?? null,
      storagePath: (r.storage_path as string | null) ?? null,
      contentType: (r.content_type as string | null) ?? null,
    }));

    // 写真がまだ無ければ何もしない (アップロード初回前など)。
    if (imageRows.length === 0) return;

    const firstPass = aggregateCertificateImageIntegrity(imageRows);

    // 既存の判定を尊重して無駄な上書きを避ける。
    const { data: cert } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cert) return;

    const existingMeta = asRecord(cert.meta);
    const prev = asRecord(existingMeta.tampering_check);
    // 手動チェック結果 (source 無し) は人の判断なので自動で上書きしない。
    if (Object.keys(prev).length > 0 && prev.source !== "auto") return;

    // ── Vision エスカレーション (グレーゾーンのみ・未判定のみ) ──────────────
    // 画像ごとの Vision 結果を meta.tampering_check.vision にキャッシュし、再アップロード時は
    // 未判定のグレー画像だけ Opus を呼ぶ。source_policies.photos=false なら Vision を一切呼ばない。
    const photosAllowed = settings.sourcePolicies?.photos !== false;
    const prevVision = asRecord(prev.vision) as Record<string, VisionVerdict>;
    const grayIds = pickGrayZoneImageIds(firstPass, MAX_VISION_IMAGES);

    const visionByImageId: Record<string, VisionVerdict> = {};
    for (const id of grayIds) {
      if (prevVision[id] && typeof prevVision[id].suspicious === "boolean") visionByImageId[id] = prevVision[id];
    }
    // 同じ写真集合で、かつ対象のグレー画像がすべて Vision 判定済みなら再実行しない。
    // (一部だけ判定済み = 前回バッチで Vision を呼べなかった残りがある場合は続行して処理する)
    const allGrayCached = grayIds.every((id) => visionByImageId[id] !== undefined);
    if (prev.signature && prev.signature === firstPass.signature && allGrayCached) return;

    const newIds = grayIds.filter((id) => !visionByImageId[id]);

    let visionCalls = 0;
    if (photosAllowed && newIds.length > 0) {
      const rowById = new Map(imageRows.map((r) => [r.id, r]));
      const flagsById = new Map(firstPass.perImage.map((p) => [p.imageId, p.flags]));
      const usage = startAiRouteUsage(VISION_ENDPOINT);
      for (const id of newIds) {
        const row = rowById.get(id);
        if (!row?.storagePath) continue;
        const mime = row.contentType ?? "image/jpeg";
        if (!VISION_MIME.has(mime)) continue;
        const base64 = await downloadImageBase64(admin, row.storagePath);
        if (!base64) continue;
        const hints = (flagsById.get(id) ?? []).map((f) => FLAG_HINT_JA[f] ?? f);
        const v = await inspectImageTamperingVision(base64, mime, hints, {
          model: modelForPlanTier(tenant.plan_tier),
        });
        visionByImageId[id] = v;
        visionCalls++;
      }
      if (visionCalls > 0) {
        usage.record({
          tenantId,
          outcome: "ok",
          meta: { auto: true, vision_calls: visionCalls, certificate_id: certificateId },
        });
      }
    }

    const result = applyVisionVerdicts(firstPass, visionByImageId);

    const tampering_check = {
      checked_at: new Date().toISOString(),
      source: "auto" as const,
      verdict: result.verdict,
      any_flagged: result.anyFlagged,
      summary: result.summary,
      flagged_count: result.suspiciousCount,
      image_count: result.imageCount,
      flags: result.flags,
      signature: result.signature,
      vision_checked: Object.keys(visionByImageId).length > 0,
      vision: visionByImageId,
    };

    // Vision に数秒かかる間に手動チェック等で meta が更新され得るため、書き込み直前に
    // meta を読み直して再ガードし、最新の meta にマージする (stale な上書きを防ぐ)。
    const { data: fresh } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!fresh) return;
    const freshMeta = asRecord(fresh.meta);
    const freshPrev = asRecord(freshMeta.tampering_check);
    // この間に手動チェック (source 無し) が入っていたら人の判断を尊重して上書きしない。
    if (Object.keys(freshPrev).length > 0 && freshPrev.source !== "auto") return;

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...freshMeta, tampering_check } })
      .eq("id", certificateId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[photoTamperingAuto] meta update failed", { tenantId, certificateId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[photoTamperingAuto] maybeAutoTamperingCheckForCertificate threw", {
      tenantId,
      certificateId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** ストレージから画像を取得し base64 で返す。失敗時は null (Vision をスキップ)。 */
async function downloadImageBase64(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).download(storagePath);
    if (error || !data) return null;
    const buf = Buffer.from(await data.arrayBuffer());
    return buf.toString("base64");
  } catch {
    return null;
  }
}
