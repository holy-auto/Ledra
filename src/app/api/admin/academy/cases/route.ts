/**
 * GET/POST /api/admin/academy/cases
 * Academy事例一覧取得 & 事例公開（C-1）
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiOk,
  apiUnauthorized,
  apiInternalError,
  apiValidationError,
  apiNotFound,
  apiForbidden,
} from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { presentAcademyCases, type AcademyCaseRow } from "@/lib/academy/casePresentation";
import { generateAcademyCaseSummary } from "@/lib/ai/academyFeedback";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { CERT_AI_COLUMNS, certAiFields, certPhotoCount } from "@/lib/certificates/aiFields";

const academyCaseActionSchema = z.object({
  case_id: z.string().uuid("case_id が必要です"),
  action: z.enum(["publish", "unpublish"], { message: "action は publish または unpublish です" }),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 公開済みAcademy事例一覧 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const type = searchParams.get("type"); // "published" | "candidates"

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("academy_cases")
      // tenant_id は「自店の事例か」を出すために取るだけで、応答には載せない
      // （presentAcademyCases が落とす）。公開事例は匿名化済みなので、
      // どの店のものかをクライアントに渡してはいけない。
      .select(
        "id, tenant_id, category, difficulty, quality_score, tags, ai_summary, good_points, caution_points, vehicle_info, is_candidate, is_published, view_count, helpful_count, created_at",
      );

    if (type === "candidates") {
      // 自テナントの候補事例
      query = query.eq("tenant_id", caller.tenantId).eq("is_candidate", true).eq("is_published", false);
    } else {
      // 公開済み全件
      query = query.eq("is_published", true);
    }

    if (category) query = query.eq("category", category);

    const { data: cases, error } = await query.order("quality_score", { ascending: false }).limit(50);

    if (error) return apiInternalError(error);

    // ノウハウ詳細(AI要約・良点・注意点・車両情報)は有料プラン限定。
    // 候補事例は自テナント所有データのため対象外。
    const knowHowAllowed = canUseFeature(caller.planTier, "academy_know_how");
    const shouldMask = type !== "candidates" && !knowHowAllowed;
    const presented = presentAcademyCases((cases ?? []) as AcademyCaseRow[], {
      tenantId: caller.tenantId,
      maskKnowHow: shouldMask,
    });

    return apiOk({ cases: presented, know_how_locked: shouldMask });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}

/** Academy事例を公開する（管理者操作） */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // 事例の公開は staff 以上。ここは所有者判定ではなくテナント判定しかしておらず、
    // 閲覧専用ロールでも公開できた。公開は AI 要約を呼び（費用が出る）、
    // knowledge_chunks に tenant_id: null で全加盟店共有の行を書くため、
    // 2026-09-01 代表判断「AI は staff 以上」を適用する。
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = academyCaseActionSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { case_id, action } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: existingCase } = await admin
      .from("academy_cases")
      .select("id, certificate_id, category, quality_score, is_candidate, tenant_id")
      .eq("id", case_id)
      .single();

    if (!existingCase) return apiNotFound("事例が見つかりません");

    // 所有テナントのみ操作可
    if (existingCase.tenant_id !== caller.tenantId) {
      return apiValidationError("この事例への操作権限がありません");
    }

    if (action === "publish") {
      // 公開だけが AI 要約を呼び、knowledge_chunks に全加盟店共有の行を書く。
      // unpublish は行の更新だけなので、AI の枠を消費させない。
      const limited = await checkRateLimit(req, "ai", `academy-case:${caller.tenantId}`);
      if (limited) return limited;

      // 証明書情報を取得してAI要約を生成
      let aiSummary: string | undefined;
      let goodPoints: string[] = [];
      let cautionPoints: string[] = [];
      let tags: string[] = [];

      if (existingCase.certificate_id) {
        const { data: cert } = await admin
          .from("certificates")
          .select(CERT_AI_COLUMNS)
          .eq("id", existingCase.certificate_id)
          .single();

        if (cert) {
          try {
            const summary = await generateAcademyCaseSummary(
              {
                serviceName: certAiFields(cert).service_name,
                description: certAiFields(cert).description,
                materialInfo: certAiFields(cert).material_info,
                category: existingCase.category,
                qualityScore: existingCase.quality_score,
                // photo_count 列は無いので certificate_images を数える
                photoCount: await certPhotoCount(admin, existingCase.certificate_id),
              },
              { model: fastModelForPlanTier(caller.planTier) },
            );
            aiSummary = summary.aiSummary;
            goodPoints = summary.goodPoints;
            cautionPoints = summary.cautionPoints;
            tags = summary.tags;
          } catch (err) {
            console.error("[academy/cases] AI summary error:", err);
          }
        }
      }

      const { error } = await admin
        .from("academy_cases")
        .update({
          is_published: true,
          anonymized: true,
          ai_summary: aiSummary,
          good_points: goodPoints,
          caution_points: cautionPoints,
          tags,
          published_by: caller.userId,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", case_id);

      if (error) return apiInternalError(error);

      // ナレッジチャンクに追加（QA検索用）
      if (aiSummary) {
        await admin.from("knowledge_chunks").insert({
          source_type: "case",
          source_id: case_id,
          content: [aiSummary, ...goodPoints, ...cautionPoints].join("\n"),
          category: existingCase.category,
          tags,
          tenant_id: null, // 全加盟店共有
        });
      }

      return apiOk({ message: "事例を公開しました" });
    }

    // action === "unpublish"
    await admin
      .from("academy_cases")
      .update({ is_published: false, updated_at: new Date().toISOString() })
      .eq("id", case_id);

    return apiOk({ message: "事例を非公開にしました" });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
