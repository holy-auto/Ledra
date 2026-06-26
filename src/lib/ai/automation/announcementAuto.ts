/**
 * 店舗お知らせを保存時に多言語へ自動翻訳する IO 層。
 *
 * shop-announcements の作成 / 更新ルートから **fire-and-forget** で呼ばれる。
 * 管理者レスポンスを遅らせないため await しない。絶対に throw しない。
 *
 * 段階:
 *   1. settings をロードし translation.auto_translate が opt-in 済みか確認 (既定 OFF)
 *   2. プラン (Standard+ / ai_translation) と is_active を確認
 *   3. title/body を en/zh/vi へ翻訳 (translationCache 活用) し
 *      shop_announcements.translations に保存
 *
 * 原文 (日本語) が常に正。翻訳は顧客向けの補助であり、壁3 とは無関係。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { translateText, translationCacheKey, type TargetLang } from "@/lib/ai/translateContent";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { getCachedTranslation, putCachedTranslation } from "@/lib/ai/translationCache";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings, resolveAutoAction } from "./policy";

const AUTO_TRANSLATE_ENDPOINT = "/api/admin/shop-announcements#auto-translate";

/** 顧客向けに自動翻訳する対象言語。 */
export const ANNOUNCEMENT_LANGS: readonly TargetLang[] = ["en", "zh", "vi"];

export interface MaybeAutoTranslateParams {
  tenantId: string;
  announcementId: string;
  title: string;
  body: string;
}

function isMissingColumnError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  const msg = (err.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}

/** 1 フィールドを翻訳 (キャッシュ優先)。失敗時は null。 */
async function translateField(text: string, lang: TargetLang, opts?: { model?: string }): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const cacheKey = translationCacheKey(trimmed, lang, "formal");
  const cached = await getCachedTranslation(cacheKey);
  if (cached) return cached.translated_text;

  const result = await translateText({ text: trimmed, targetLang: lang, tone: "formal" }, opts);
  if (!result.ai || !result.translated || result.translated === trimmed) return null;

  void putCachedTranslation({
    cacheKey,
    sourceText: trimmed,
    targetLang: lang,
    tone: "formal",
    translatedText: result.translated,
    confidence: result.confidence,
  });
  return result.translated;
}

/**
 * 店舗お知らせを自動翻訳し translations 列に保存する。失敗しても投げない。
 */
export async function maybeAutoTranslateShopAnnouncement(params: MaybeAutoTranslateParams): Promise<void> {
  const { tenantId, announcementId, title, body } = params;
  try {
    if (!title.trim() && !body.trim()) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!resolveAutoAction(settings, "translation.auto_translate")) return;

    const admin = createServiceRoleAdmin("AI auto-translate shop announcement — admin save, fire-and-forget");
    const { data: tenant } = await admin.from("tenants").select("plan_tier, is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;
    if (!canUseFeature(normalizePlanTier(tenant.plan_tier), "ai_translation")) return;

    const usage = startAiRouteUsage(AUTO_TRANSLATE_ENDPOINT);
    const modelOpts = { model: fastModelForPlanTier(tenant.plan_tier) };
    const translations: Record<string, { title: string; body: string }> = {};
    for (const lang of ANNOUNCEMENT_LANGS) {
      const [t, b] = await Promise.all([translateField(title, lang, modelOpts), translateField(body, lang, modelOpts)]);
      // どちらかが翻訳できた言語だけ保存 (原文フォールバックは入れない)。
      if (t != null || b != null) {
        translations[lang] = { title: t ?? title, body: b ?? body };
      }
    }

    if (Object.keys(translations).length === 0) {
      usage.record({ tenantId, outcome: "error", meta: { auto: true, empty: true } });
      return;
    }

    const { error: upErr } = await admin
      .from("shop_announcements")
      .update({ translations, translated_at: new Date().toISOString() })
      .eq("id", announcementId)
      .eq("tenant_id", tenantId);
    if (upErr && !isMissingColumnError(upErr)) {
      logger.warn("[announcementAuto] translations update failed", { tenantId, err: upErr.message });
    }

    usage.record({
      tenantId,
      outcome: "ok",
      meta: { auto: true, langs: Object.keys(translations) },
    });
  } catch (e) {
    logger.warn("[announcementAuto] maybeAutoTranslateShopAnnouncement threw", {
      tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
