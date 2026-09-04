/**
 * POST /api/admin/translate
 *
 * 任意のテキストを指定言語に翻訳する汎用エンドポイント。
 * - お知らせ / 製品説明 / 利用規約 / 証明書本文 などのテナント文書を多言語化
 * - kind ("announcement" | "product_description" | "general") で
 *   `translation.*` のフィールドポリシーを切り替え
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { translateText, translationCacheKey } from "@/lib/ai/translateContent";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { getCachedTranslation, putCachedTranslation } from "@/lib/ai/translationCache";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  text: z.string().min(1).max(8000),
  target_lang: z.enum(["en", "zh", "vi", "ko", "pt-BR"]),
  tone: z.enum(["formal", "casual", "marketing"]).optional(),
  glossary: z.record(z.string(), z.string()).optional(),
  kind: z.enum(["announcement", "product_description", "general"]).optional(),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/translate");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_translation")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 多言語翻訳は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, translated: parsed.data.text });
    }

    const policyKey =
      parsed.data.kind === "announcement"
        ? "translation.announcement"
        : parsed.data.kind === "product_description"
          ? "translation.product_description"
          : "translation.announcement"; // general も announcement と同じ閾値で扱う

    if (resolveFieldPolicy(settings, policyKey) === "manual") {
      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ai_disabled",
        meta: { reason: "policy_manual" },
      });
      return apiOk({ ai_disabled: false, translated: parsed.data.text, skipped: "policy is manual" });
    }

    const cacheKey = translationCacheKey(parsed.data.text, parsed.data.target_lang, parsed.data.tone);
    // glossary が渡されたら都度翻訳 (固有用語の置換結果はキャッシュしない)
    const useCache = !parsed.data.glossary;
    if (useCache) {
      const cached = await getCachedTranslation(cacheKey);
      if (cached) {
        usage.record({
          tenantId: caller.tenantId,
          userId: caller.userId,
          outcome: "ok",
          confidence: cached.confidence,
          meta: { ai: false, cached: true, target_lang: parsed.data.target_lang, hit_count: cached.hit_count },
        });
        return apiOk({
          ai_disabled: false,
          translated: cached.translated_text,
          confidence: cached.confidence,
          ai: false,
          cache_key: cacheKey,
          cached: true,
        });
      }
    }

    const result = await translateText(
      {
        text: parsed.data.text,
        targetLang: parsed.data.target_lang,
        tone: parsed.data.tone,
        glossary: parsed.data.glossary,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    // AI が正常に翻訳した (= result.ai = true) ものだけキャッシュ。
    // フォールバック (= 元テキストをそのまま返した) は cache に入れない。
    if (useCache && result.ai && result.translated && result.translated !== parsed.data.text) {
      void putCachedTranslation({
        cacheKey,
        sourceText: parsed.data.text,
        targetLang: parsed.data.target_lang,
        tone: parsed.data.tone ?? "formal",
        translatedText: result.translated,
        confidence: result.confidence,
      });
    }

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, cached: false, target_lang: parsed.data.target_lang, kind: parsed.data.kind ?? "general" },
    });

    return apiOk({
      ai_disabled: false,
      translated: result.translated,
      confidence: result.confidence,
      ai: result.ai,
      cache_key: cacheKey,
      cached: false,
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "translate");
  }
}
