/**
 * 施工写真アップロード時に「施工内容ドラフト」を AI Vision で自動生成する IO 層。
 *
 * 写真アップロードルート (`/api/certificates/images/upload` POST) から `after()` 経由で
 * fire-and-forget で呼ばれる。after() は auth 無しなので service-role で読み書きし、
 * 絶対に throw しない。photoQualityAuto.ts / photoStageClassifyAuto.ts と同型。
 *
 * 段階:
 *   1. settings をロードし photo.auto_draft_content が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_quality_vision)・is_active・source_policies.photos を確認
 *   3. 未提案の証明書のみ代表写真 1〜2 枚を Vision で読み取り施工内容ドラフトを生成
 *   4. 提案を certificates.meta.content_draft_suggestion に保存 (人が UI で確定する提案のみ)
 *
 * 壁3 とは無関係: 施工内容欄への反映・発行・金額には関与しない、提案の注釈のみ。
 * 証明書単位で一度だけ提案し、写真追加ごとの再課金はしない（pickImagesForContentDraft）。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import {
  draftPhotoContent,
  pickImagesForContentDraft,
  type ImageMediaType,
  type PhotoContentResult,
} from "@/lib/ai/photoContentDraft";
import { visionModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoDraftContent } from "./orchestrator";

const CONTENT_ENDPOINT = "/api/certificates/images/upload#auto-content-draft";

/** 1 証明書あたり Vision に渡す代表写真の上限（コスト抑制）。 */
const MAX_CONTENT_IMAGES = 2;
const VISION_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export interface MaybeAutoDraftContentParams {
  tenantId: string;
  certificateId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

type StoredContentDraft = PhotoContentResult & { source: "auto"; at: string; image_ids: string[] };

/** 指定証明書の写真から施工内容ドラフトを生成し meta に保存する。失敗しても投げない。 */
export async function maybeAutoDraftContentForCertificate(params: MaybeAutoDraftContentParams): Promise<void> {
  const { tenantId, certificateId } = params;
  try {
    if (!tenantId || !certificateId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoDraftContent(settings)) return;
    if (settings.sourcePolicies?.photos === false) return; // 写真を Vision に送る情報源が無効

    const admin = createServiceRoleAdmin("AI auto content draft — image upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_quality_vision")) return;

    // 既に提案済みか確認（証明書単位で1度だけ）。
    const { data: cert } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cert) return;
    const existingMeta = asRecord(cert.meta);
    const prevSuggestions = asRecord(existingMeta.content_draft_suggestion);

    const { data: imageRows } = await admin
      .from("certificate_images")
      .select("id, stage, storage_path, content_type")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    const rows = (imageRows ?? []) as Array<{
      id: string;
      stage: string | null;
      storage_path: string | null;
      content_type: string | null;
    }>;
    if (rows.length === 0) return;

    const targetIds = pickImagesForContentDraft(
      rows.map((r) => ({ id: r.id, stage: r.stage })),
      prevSuggestions,
      MAX_CONTENT_IMAGES,
    );
    if (targetIds.length === 0) return;

    const rowById = new Map(rows.map((r) => [r.id, r]));
    const images: Array<{ base64: string; mediaType: ImageMediaType }> = [];
    for (const id of targetIds) {
      const row = rowById.get(id);
      const storagePath = row?.storage_path ?? null;
      const mime = row?.content_type ?? "image/jpeg";
      if (!storagePath || !VISION_MIME.has(mime)) continue;
      const base64 = await downloadImageBase64(admin, storagePath);
      if (base64) images.push({ base64, mediaType: mime as ImageMediaType });
    }
    if (images.length === 0) return;

    const usage = startAiRouteUsage(CONTENT_ENDPOINT);
    const result = await draftPhotoContent(images, { model: visionModelForPlanTier(tenant.plan_tier) });
    usage.record({
      tenantId,
      outcome: "ok",
      meta: { auto: true, certificate_id: certificateId, category: result.serviceCategory },
    });

    // 空提案（other/空文字）も保存して「提案済み」とし、写真追加ごとの再課金を防ぐ。
    // UI は contentDraft が空でない提案だけ表示すればよい。
    const stored: StoredContentDraft = {
      ...result,
      source: "auto",
      at: new Date().toISOString(),
      image_ids: targetIds,
    };

    // 書き込み直前に meta を読み直してマージ（並行 auto アクションの更新を取りこぼさない）。
    const { data: fresh } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!fresh) return;
    const freshMeta = asRecord(fresh.meta);
    // この間に別実行が提案済みにしていれば二重書きしない。
    if (Object.keys(asRecord(freshMeta.content_draft_suggestion)).length > 0) return;

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...freshMeta, content_draft_suggestion: stored } })
      .eq("id", certificateId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[photoContentDraftAuto] meta update failed", { tenantId, certificateId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[photoContentDraftAuto] maybeAutoDraftContentForCertificate threw", {
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
