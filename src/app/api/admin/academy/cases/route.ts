/**
 * GET/POST /api/admin/academy/cases
 * Academy事例一覧取得 & 事例公開（C-1）
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { generateAcademyCaseSummary } from "@/lib/ai/academyFeedback";

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
      .select(
        "id, category, difficulty, quality_score, tags, ai_summary, good_points, caution_points, vehicle_info, is_candidate, is_published, view_count, helpful_count, created_at",
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

    return apiOk({ cases: cases ?? [] });
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

    const body = await req.json();
    const { case_id, action } = body as { case_id?: string; action?: "publish" | "unpublish" };

    if (!case_id) return apiValidationError("case_id が必要です");

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
      // 証明書情報を取得してAI要約を生成
      let aiSummary: string | undefined;
      let goodPoints: string[] = [];
      let cautionPoints: string[] = [];
      let tags: string[] = [];

      if (existingCase.certificate_id) {
        const { data: cert } = await admin
          .from("certificates")
          .select("service_name, description, material_info, photo_count")
          .eq("id", existingCase.certificate_id)
          .single();

        if (cert) {
          try {
            const summary = await generateAcademyCaseSummary({
              serviceName: cert.service_name ?? "",
              description: cert.description ?? undefined,
              materialInfo: cert.material_info ?? undefined,
              category: existingCase.category,
              qualityScore: existingCase.quality_score,
              photoCount: cert.photo_count ?? 0,
            });
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

    if (action === "unpublish") {
      await admin
        .from("academy_cases")
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq("id", case_id);

      return apiOk({ message: "事例を非公開にしました" });
    }

    return apiValidationError("action は publish または unpublish です");
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
