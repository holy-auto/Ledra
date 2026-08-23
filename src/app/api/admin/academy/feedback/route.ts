/**
 * POST /api/admin/academy/feedback
 * Academy AIフィードバック（C-2 添削モード）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateCertificateFeedback } from "@/lib/ai/academyFeedback";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERT_AI_COLUMNS, certAiFields, certPhotoCount } from "@/lib/certificates/aiFields";

const academyFeedbackSchema = z.object({
  certificate_id: z.string().uuid("certificate_id が必要です"),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!canUseFeature(caller.planTier, "ai_academy_feedback")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    const parsed = academyFeedbackSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { certificate_id } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 証明書情報取得
    const { data: cert } = await admin
      .from("certificates")
      .select(CERT_AI_COLUMNS)
      .eq("id", certificate_id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!cert) return apiNotFound("証明書が見つかりません");

    // 既存の品質スコアを取得
    const { data: qualityScore } = await admin
      .from("certificate_quality_scores")
      .select("score, missing_fields, warning_messages")
      .eq("certificate_id", certificate_id)
      .single();

    // 公開事例から類似を検索（タグ・カテゴリで）
    const { data: similarCases } = await admin
      .from("academy_cases")
      .select("id, ai_summary")
      .eq("is_published", true)
      // certificates に category 列は無いので、施工種別で近い事例を引く
      .eq("category", (certAiFields(cert).service_name || null) ?? "")
      .limit(3);

    const feedback = await generateCertificateFeedback(
      {
        certificate: {
          ...certAiFields(cert),
          // work_areas / category / photo_count は certificates に列が無い
          photo_count: await certPhotoCount(admin, certificate_id),
        },
        qualityScore: qualityScore?.score ?? undefined,
        missingFields: qualityScore?.missing_fields ?? undefined,
        warningMessages: ((qualityScore?.warning_messages as { message: string }[]) ?? []).map((w) => w.message),
        similarGoodCases: (similarCases ?? []).map((c) => ({
          caseId: c.id,
          learnPoint: c.ai_summary ?? "",
        })),
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    // 学習進捗を更新（upsert + certs_reviewed インクリメント）
    const { data: existing } = await admin
      .from("academy_progress")
      .select("certs_reviewed")
      .eq("tenant_id", caller.tenantId)
      .eq("user_id", caller.userId)
      .single();

    await admin.from("academy_progress").upsert(
      {
        tenant_id: caller.tenantId,
        user_id: caller.userId,
        certs_reviewed: (existing?.certs_reviewed ?? 0) + 1,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );

    return apiOk({ feedback });
  } catch (e: unknown) {
    return apiInternalError(e, "academy/feedback");
  }
}
