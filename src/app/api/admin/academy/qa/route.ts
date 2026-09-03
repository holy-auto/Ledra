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

const qaSchema = z.object({
  question: z.string().trim().min(5, "質問を5文字以上で入力してください").max(2000),
  category: z.string().trim().max(100).optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

    const answer = await generateQAAnswer(
      {
        question: parsed.data.question,
        category: parsed.data.category,
        tenantId: caller.tenantId,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    return apiOk({ answer });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
