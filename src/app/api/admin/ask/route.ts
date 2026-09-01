/**
 * POST /api/admin/ask
 *
 * ダッシュボード最上部の「Ledraに聞く」入口。まず決定的なルーティング
 * (matchAskRoute) を試し、マッチすれば AI を呼ばず画面遷移だけ即答する
 * （コスト・プラン制限なし）。マッチしない場合のみ qaAssistant にフォール
 * バックし、施工ナレッジ・Academy事例から回答する。
 *
 * gating（AI フォールバック時のみ）: プラン機能 ai_academy_qa (Standard 以上)。
 * AI 使用量は startAiRouteUsage 経由で ai_usage_logs 記録 + 月次コストキャップ加算。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { matchAskRoute } from "@/lib/ai/askRouter";
import { generateQAAnswer } from "@/lib/ai/qaAssistant";
import { isAdvancedFeatureVisibleForUser } from "@/lib/features/serverVisibility";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const askSchema = z.object({
  question: z.string().trim().min(2, "質問を2文字以上で入力してください。").max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = askSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { question } = parsed.data;

    // 決定的ルーティングでヒットすれば AI を呼ばず即答（無料・プラン制限なし）。
    const route = matchAskRoute(question);
    if (route) {
      return apiOk({ result: { type: "link" as const, href: route.href, label: route.label } });
    }

    // ここから先は AI フォールバック。field-knowledge/ask と同じ gating に揃える。
    const limited = await checkRateLimit(req, "ai", caller.userId);
    if (limited) return limited;

    if (!canUseFeature(caller.planTier, "ai_academy_qa")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます。", { code: "plan_limit" });
    }

    // academy-qa は advanced 機能としてテナント無効化/ユーザー未 opt-in にできる
    // （/admin/academy/qa の元ネタと同じエンジンをここでも呼ぶため、プラン制限だけ
    // 見てテナントの無効化設定をすり抜けないようにする）。
    if (!(await isAdvancedFeatureVisibleForUser(caller.tenantId, caller.userId, "academy-qa"))) {
      return apiValidationError("この機能は無効になっています。設定をご確認ください。", { code: "feature_disabled" });
    }

    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled) {
      return apiValidationError("AI が無効か、今月の利用上限に達しています。設定をご確認ください。", {
        code: "ai_disabled",
      });
    }

    const usage = startAiRouteUsage("/api/admin/ask");
    const answer = await generateQAAnswer(
      { question, tenantId: caller.tenantId },
      { model: fastModelForPlanTier(caller.planTier) },
    );
    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ok" });

    return apiOk({ result: { type: "answer" as const, ...answer } });
  } catch (e: unknown) {
    return apiInternalError(e, "admin ask");
  }
}
