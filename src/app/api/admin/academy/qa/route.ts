/**
 * POST /api/admin/academy/qa
 * QAアシスタント（C-3）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateQAAnswer } from "@/lib/ai/qaAssistant";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!canUseFeature(caller.planTier, "ai_academy_qa")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    const body = await req.json();
    const { question, category } = body as {
      question?: string;
      category?: string;
    };

    if (!question || question.trim().length < 5) {
      return apiValidationError("質問を5文字以上で入力してください");
    }

    const answer = await generateQAAnswer({
      question: question.trim(),
      category,
      tenantId: caller.tenantId,
    });

    return apiOk({ answer });
  } catch (e: any) {
    return apiInternalError(e);
  }
}
