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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { translateText, translationCacheKey } from "@/lib/ai/translateContent";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";

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
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!canUseFeature(caller.planTier, "ai_translation")) {
      return apiPlanLimit("AI 多言語翻訳は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) return apiOk({ ai_disabled: true, translated: parsed.data.text });

    const policyKey =
      parsed.data.kind === "announcement"
        ? "translation.announcement"
        : parsed.data.kind === "product_description"
          ? "translation.product_description"
          : "translation.announcement"; // general も announcement と同じ閾値で扱う

    if (resolveFieldPolicy(settings, policyKey) === "manual") {
      return apiOk({ ai_disabled: false, translated: parsed.data.text, skipped: "policy is manual" });
    }

    const result = await translateText({
      text: parsed.data.text,
      targetLang: parsed.data.target_lang,
      tone: parsed.data.tone,
      glossary: parsed.data.glossary,
    });

    return apiOk({
      ai_disabled: false,
      translated: result.translated,
      confidence: result.confidence,
      ai: result.ai,
      cache_key: translationCacheKey(parsed.data.text, parsed.data.target_lang, parsed.data.tone),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "translate");
  }
}
