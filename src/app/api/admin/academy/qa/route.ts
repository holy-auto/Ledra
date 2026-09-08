/**
 * POST /api/admin/academy/qa
 * QAアシスタント（C-3）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateQAAnswer } from "@/lib/ai/qaAssistant";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

const qaSchema = z.object({
  question: z.string().trim().min(5, "質問を5文字以上で入力してください").max(2000),
  category: z.string().trim().max(100).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/academy/qa");
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上（2026-09-01 代表判断）。呼ぶたびに費用が出るため
    // 閲覧専用ロールを弾く。アカデミー機能だが中身は AI なのでこちらの判断に従う。
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_academy_qa")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    // Q&A の回答生成は呼ぶたびに AI 費用が出る。
    // プラン判定より後に置く。Free のテナントには 429 ではなく案内を返したい。
    const limited = await checkRateLimit(req, "ai", `academy-qa:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = qaSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    // E4-7 是正 (2026-09-08): 月次コストキャップ超過時は enabled=false に倒るので、
    // それを見て呼び出し自体をスキップする。
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiValidationError("月次のAI利用上限に達しました。来月まで今しばらくお待ちください。", {
        code: "ai_cost_cap_exceeded",
      });
    }

    const answer = await generateQAAnswer(
      {
        question: parsed.data.question,
        category: parsed.data.category,
        tenantId: caller.tenantId,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ok" });
    return apiOk({ answer });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e);
  }
}
