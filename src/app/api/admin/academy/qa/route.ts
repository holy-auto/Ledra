/**
 * POST /api/admin/academy/qa
 * QAアシスタント（C-3）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateQAAnswer } from "@/lib/ai/qaAssistant";

const qaSchema = z.object({
  question: z.string().trim().min(5, "質問を5文字以上で入力してください").max(2000),
  category: z.string().trim().max(100).optional(),
});

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

    const parsed = qaSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const answer = await generateQAAnswer({
      question: parsed.data.question,
      category: parsed.data.category,
      tenantId: caller.tenantId,
    });

    return apiOk({ answer });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
