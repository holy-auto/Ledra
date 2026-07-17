/**
 * 施工写真アップロード時に before/after 自動分類を、人の操作なしで実行する IO 層。
 *
 * 写真アップロードルート (`/api/certificates/images/upload` POST) から `after()` 経由で
 * fire-and-forget で呼ばれる (serverless でも完走)。after() は auth 無しなので service-role
 * で読み書きし、絶対に throw しない。photoTamperingAuto.ts と同型。
 *
 * 段階:
 *   1. settings をロードし photo.auto_classify_stage が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_quality_vision) と is_active を確認
 *   3. 未タグ (stage='unspecified') かつ未提案の画像だけを Vision で分類
 *   4. 提案を certificates.meta.stage_suggestions に保存 (人が UI で確定する提案のみ)
 *
 * 壁3 とは無関係: stage の書き換え (発行の before/after ゲート) はせず、提案の注釈のみ。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import {
  classifyPhotoStage,
  pickImagesToClassify,
  aiStageToCertStage,
  type ImageMediaType,
} from "@/lib/ai/photoStageClassify";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoClassifyStage } from "./orchestrator";

const VISION_ENDPOINT = "/api/certificates/images/upload#auto-stage-classify";

/** 1 回の実行で分類する画像数の上限 (暴走防止)。 */
const MAX_CLASSIFY_IMAGES = 8;
const VISION_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface MaybeAutoClassifyStageParams {
  tenantId: string;
  certificateId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type StageSuggestion = { stage: "intake_before" | "after"; confidence: number; source: "auto"; at: string };

/** 指定証明書の未タグ写真に before/after 分類を自動適用する。失敗しても投げない。 */
export async function maybeAutoClassifyStageForCertificate(params: MaybeAutoClassifyStageParams): Promise<void> {
  const { tenantId, certificateId } = params;
  try {
    if (!tenantId || !certificateId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoClassifyStage(settings)) return;
    if (settings.sourcePolicies?.photos === false) return; // 写真を Vision に送る情報源が無効

    const admin = createServiceRoleAdmin("AI auto stage classify — image upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_quality_vision")) return;

    const { data: rows } = await admin
      .from("certificate_images")
      .select("id, stage, storage_path, content_type")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    if (!rows || rows.length === 0) return;

    // 既存の提案を読み、未タグ・未提案の画像だけ対象にする。
    const { data: cert } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cert) return;
    const existingMeta = asRecord(cert.meta);
    const prevSuggestions = asRecord(existingMeta.stage_suggestions) as Record<string, StageSuggestion>;

    const targetIds = pickImagesToClassify(
      rows.map((r) => ({ id: r.id as string, stage: (r.stage as string | null) ?? null })),
      prevSuggestions,
      MAX_CLASSIFY_IMAGES,
    );
    if (targetIds.length === 0) return;

    const rowById = new Map(rows.map((r) => [r.id as string, r]));
    const model = fastModelForPlanTier(tenant.plan_tier);
    const usage = startAiRouteUsage(VISION_ENDPOINT);

    const newSuggestions: Record<string, StageSuggestion> = {};
    let calls = 0;
    for (const id of targetIds) {
      const row = rowById.get(id);
      const storagePath = row?.storage_path as string | null;
      const mime = (row?.content_type as string | null) ?? "image/jpeg";
      if (!storagePath || !VISION_MIME.has(mime)) continue;
      const base64 = await downloadImageBase64(admin, storagePath);
      if (!base64) continue;
      const result = await classifyPhotoStage(base64, mime as ImageMediaType, { model });
      calls++;
      const certStage = aiStageToCertStage(result.stage);
      if (certStage) {
        newSuggestions[id] = {
          stage: certStage,
          confidence: result.confidence,
          source: "auto",
          at: new Date().toISOString(),
        };
      }
    }

    if (calls > 0) {
      usage.record({
        tenantId,
        outcome: "ok",
        meta: { auto: true, classify_calls: calls, certificate_id: certificateId },
      });
    }
    if (Object.keys(newSuggestions).length === 0) return;

    // 書き込み直前に meta を読み直してマージ (stale な上書きを防ぐ)。
    const { data: fresh } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!fresh) return;
    const freshMeta = asRecord(fresh.meta);
    const mergedSuggestions = { ...asRecord(freshMeta.stage_suggestions), ...newSuggestions };

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...freshMeta, stage_suggestions: mergedSuggestions } })
      .eq("id", certificateId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[photoStageClassifyAuto] meta update failed", { tenantId, certificateId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[photoStageClassifyAuto] maybeAutoClassifyStageForCertificate threw", {
      tenantId,
      certificateId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** ストレージから画像を取得し base64 で返す。失敗時は null。 */
async function downloadImageBase64(
  admin: ReturnType<typeof createServiceRoleAdmin>,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).download(storagePath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}
