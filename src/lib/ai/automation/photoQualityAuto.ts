/**
 * 証明書写真のアップロード時に、Ledra Standard 基準の品質・抜け漏れ監査を
 * 人の操作なしで自動実行する IO 層。
 *
 * 写真アップロードルート (`/api/certificates/images/upload` POST) から、レスポンス送出後に
 * `after()` 経由で **fire-and-forget** で呼ばれる。after() は auth セッションが切れているため
 * service-role で読み書きし (tenant_id で明示スコープ)、絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし photo.auto_quality_check が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_quality_vision) と is_active を確認 (Vision の可否判定)
 *   3. 証明書の category (service_type) と、作成時に保存したフラットな field_values
 *      スナップショット (quality_fields_json) を使い、発行前ゲートと同一入力で監査を再現
 *   4. 結果 (スコア / 抜け漏れ / 警告) を certificates.meta.quality_check に注釈として保存
 *
 * 壁3 とは無関係: 出力はスコア・指摘の注釈のみで、発行のブロックや金額・本人確認には
 * 一切関与しない (人が発行前に確認できる)。Vision コストは plan / source_policies.photos /
 * 月次コストキャップに従い、写真集合が変わらなければ再実行しない。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { auditCertificatePhotos, type StandardRule } from "@/lib/ai/photoQualityCheck";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoQualityCheck } from "./orchestrator";

const QUALITY_ENDPOINT = "/api/certificates/images/upload#auto-quality";

export interface MaybeAutoQualityCheckParams {
  tenantId: string;
  certificateId: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** quality_fields_json (任意) を文字列 Record に正規化する。 */
function asStringRecord(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/**
 * 指定証明書の写真群に品質・抜け漏れ監査を自動適用する。失敗しても投げない。
 */
export async function maybeAutoQualityCheckForCertificate(params: MaybeAutoQualityCheckParams): Promise<void> {
  const { tenantId, certificateId } = params;
  try {
    if (!tenantId || !certificateId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoQualityCheck(settings)) return;

    const admin = createServiceRoleAdmin("AI auto quality check — image upload after() lacks auth session");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    const { data: cert } = await admin
      .from("certificates")
      .select("id, service_type, quality_fields_json, meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!cert) return;

    // category (service_type) が無いと standard_rule を引けず、監査が不正確になるためスキップ。
    const category = (cert.service_type as string | null)?.trim() || null;
    if (!category) return;

    // quality_fields_json は新規作成フローでのみ保存される。スナップショットが無い証明書
    // (既存 / API 作成 / 写真前に項目編集) を監査すると、必須項目を誤って「未入力」と判定して
    // しまう。注釈用途で誤データを出さないため、スナップショットが空ならスキップする。
    const fieldValues = asStringRecord(cert.quality_fields_json);
    if (Object.keys(fieldValues).length === 0) return;

    // 当該カテゴリの最新有効ルールを取得 (StandardRule の最小集合)。
    const { data: rule } = await admin
      .from("standard_rules")
      .select("id, category, category_label, required_photos, required_fields, warning_rules, standard_level")
      .eq("category", category)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rule) return; // ルール未整備のカテゴリは監査対象外 (誤った指摘を出さない)。

    const { data: imageRows } = await admin
      .from("certificate_images")
      .select("id, storage_path, content_type")
      .eq("certificate_id", certificateId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true });
    const rows = (imageRows ?? []) as Array<{ id: string; storage_path: string | null; content_type: string | null }>;
    if (rows.length === 0) return;

    // 写真集合の signature。同じ写真集合で既に auto 監査済みなら再実行しない (再課金防止)。
    const signature = `${rows.length}:${rows
      .map((r) => r.id)
      .sort()
      .join(",")}`;
    const existingMeta = asRecord(cert.meta);
    const prev = asRecord(existingMeta.quality_check);
    if (prev.source === "auto" && prev.signature === signature) return;

    // Vision 呼び出しの可否: master switch (settings.enabled) + プラン (ai_quality_vision) +
    // source_policies.photos。不可なら checkPhotosWithAI=false でルールベース監査のみ実行する。
    const photosAllowed = settings.sourcePolicies?.photos !== false;
    const useVision =
      settings.enabled && photosAllowed && canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_quality_vision");

    // 監査に渡す URL 配列は **常に rows.length と同じ長さ** にする (枚数判定が崩れて「写真不足」と
    // 誤検知しないように)。Vision を使う場合のみ署名 URL を発行し、署名できなかった行 / storage_path
    // 欠落行はプレースホルダで埋める (checkPhotoContent はプレースホルダの fetch に失敗しても
    // permissive 扱いなので無害)。Vision を呼ぶ価値があるのは実 URL が 1 つ以上あるときだけ。
    const placeholder = (i: number) => `cert://${certificateId}/${i}`;
    let auditUrls: string[];
    let hasRealUrls = false;
    if (useVision) {
      const signed = await Promise.all(
        rows.map(async (r) => {
          if (!r.storage_path) return null;
          try {
            const { data } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).createSignedUrl(r.storage_path, 600);
            return data?.signedUrl ?? null;
          } catch {
            return null;
          }
        }),
      );
      hasRealUrls = signed.some((u) => !!u);
      auditUrls = signed.map((u, i) => u ?? placeholder(i));
    } else {
      auditUrls = rows.map((_, i) => placeholder(i));
    }

    const usage = startAiRouteUsage(QUALITY_ENDPOINT);
    const audit = await auditCertificatePhotos({
      certificateId,
      category,
      photoUrls: auditUrls,
      fieldValues,
      standardRule: rule as StandardRule,
      checkPhotosWithAI: useVision && hasRealUrls,
    });

    usage.record({
      tenantId,
      outcome: useVision ? "ok" : "ai_disabled",
      meta: { auto: true, status: audit.overallStatus, score: audit.score, vision: useVision },
    });

    const quality_check = {
      checked_at: new Date().toISOString(),
      source: "auto" as const,
      overall_status: audit.overallStatus,
      standard_level: audit.standardLevel,
      score: audit.score,
      missing_photos: audit.missingPhotos,
      missing_fields: audit.missingFields,
      warnings: audit.warningMessages,
      image_count: rows.length,
      vision_checked: useVision && hasRealUrls,
      signature,
    };

    // 書き込み直前に meta を読み直し、並行する tampering_check 等の更新を取りこぼさずマージする。
    const { data: fresh } = await admin
      .from("certificates")
      .select("meta")
      .eq("id", certificateId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!fresh) return;
    const freshMeta = asRecord(fresh.meta);
    const freshPrev = asRecord(freshMeta.quality_check);
    // この間に同じ写真集合で別の auto 監査が入っていれば二重書きしない。
    if (freshPrev.source === "auto" && freshPrev.signature === signature) return;

    const { error: upErr } = await admin
      .from("certificates")
      .update({ meta: { ...freshMeta, quality_check } })
      .eq("id", certificateId)
      .eq("tenant_id", tenantId);
    if (upErr) {
      logger.warn("[photoQualityAuto] meta update failed", { tenantId, certificateId, err: upErr.message });
    }
  } catch (e) {
    logger.warn("[photoQualityAuto] maybeAutoQualityCheckForCertificate threw", {
      tenantId,
      certificateId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
