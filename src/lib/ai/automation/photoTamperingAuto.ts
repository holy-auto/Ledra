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
 *   3. certificate_images のアップロード時シグナルを集約し、verdict を
 *      certificates.meta.tampering_check に保存
 *
 * コスト: 追加の画像ダウンロードも新規 AI 呼び出しも行わない (既存シグナルの集約)。
 * 壁3 とは無関係 (verdict/flags は注釈のみで、発行・金額・本人確認には不介入)。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { aggregateCertificateImageIntegrity, type CertImageIntegrityInput } from "@/lib/ai/certificatePhotoIntegrity";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoTamperingCheck } from "./orchestrator";

export interface MaybeAutoTamperingCheckParams {
  tenantId: string;
  certificateId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

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
      .select("id, sha256, perceptual_hash, exif_captured_at, exif_device_model, deepfake_verdict, authenticity_grade")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });

    const images: CertImageIntegrityInput[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      sha256: (r.sha256 as string | null) ?? null,
      perceptualHash: (r.perceptual_hash as string | null) ?? null,
      capturedAt: (r.exif_captured_at as string | null) ?? null,
      deviceModel: (r.exif_device_model as string | null) ?? null,
      deepfakeVerdict: (r.deepfake_verdict as string | null) ?? null,
      authenticityGrade: (r.authenticity_grade as string | null) ?? null,
    }));

    // 写真がまだ無ければ何もしない (アップロード初回前など)。
    if (images.length === 0) return;

    const result = aggregateCertificateImageIntegrity(images);

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
    // 同じ写真集合で既に自動判定済みなら再実行しない。
    if (prev.signature && prev.signature === result.signature) return;

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
    };

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...existingMeta, tampering_check } })
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
