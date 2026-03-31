/**
 * POST /api/admin/certificates/ai-quality
 * 撮影ガイドと抜け漏れ検知（B-3）
 * minPlan: free（全プランで基本チェック可能）
 * Vision AI チェックは standard 以上
 */
import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { auditCertificatePhotos, type StandardRule } from "@/lib/ai/photoQualityCheck";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json();
    const { certificate_id, category, photo_urls, field_values } = body as {
      certificate_id?: string;
      category?: string;
      photo_urls?: string[];
      field_values?: Record<string, string>;
    };

    if (!category) return apiValidationError("category が必要です");

    const admin = getSupabaseAdmin();

    // Standard ルール取得
    const { data: rule } = await admin
      .from("standard_rules")
      .select("*")
      .eq("category", category)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (!rule) {
      // ルールが存在しない場合は基本通過
      return apiOk({
        audit: {
          certificateId: certificate_id ?? "",
          category,
          overallStatus: "pass",
          standardLevel: "basic",
          score: 70,
          photoResults: [],
          missingPhotos: [],
          missingFields: [],
          warningMessages: [],
        },
      });
    }

    // Vision AIチェックはstandard以上
    const tier = normalizePlanTier(caller.planTier);
    const useVision = tier === "standard" || tier === "pro";

    const audit = await auditCertificatePhotos({
      certificateId: certificate_id ?? "",
      category,
      photoUrls: photo_urls ?? [],
      fieldValues: field_values ?? {},
      standardRule: rule as StandardRule,
      checkPhotosWithAI: useVision,
    });

    // 結果をDBにキャッシュ
    if (certificate_id) {
      await admin
        .from("certificate_quality_scores")
        .upsert({
          certificate_id,
          tenant_id: caller.tenantId,
          overall_status: audit.overallStatus,
          standard_level: audit.standardLevel,
          score: audit.score,
          photo_results: audit.photoResults,
          missing_photos: audit.missingPhotos,
          missing_fields: audit.missingFields,
          warning_messages: audit.warningMessages,
          ai_checked_at: useVision ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .on("conflict", "certificate_id");

      // 品質スコア80以上・写真4枚以上なら Academy候補フラグ
      if (audit.score >= 80 && (photo_urls?.length ?? 0) >= 4) {
        await admin
          .from("academy_cases")
          .upsert({
            certificate_id,
            tenant_id: caller.tenantId,
            category,
            quality_score: audit.score,
            is_candidate: true,
            updated_at: new Date().toISOString(),
          })
          .on("conflict", "certificate_id");
      }
    }

    return apiOk({ audit });
  } catch (e: any) {
    return apiInternalError(e);
  }
}
