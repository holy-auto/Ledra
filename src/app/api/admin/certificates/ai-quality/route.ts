/**
 * POST /api/admin/certificates/ai-quality
 * 撮影ガイドと抜け漏れ検知（B-3）
 * minPlan: free（全プランで基本チェック可能）
 * Vision AI チェックは standard 以上
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { normalizePlanTier } from "@/lib/billing/planFeatures";
import { auditCertificatePhotos, type StandardRule } from "@/lib/ai/photoQualityCheck";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";

const aiQualitySchema = z.object({
  certificate_id: z.string().uuid().optional(),
  category: z.string().trim().min(1, "category が必要です").max(100),
  photo_urls: z.array(z.string().url()).max(50).optional(),
  field_values: z.record(z.string(), z.string()).optional(),
});

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // Vision AI (Anthropic) を最大 50 枚分呼び出すため、テナント単位で
    // レートリミットを掛けて課金爆発を防ぐ。
    const limited = await checkRateLimit(req, "auth", `ai-quality:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = aiQualitySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { certificate_id, category, photo_urls, field_values } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Standard ルール取得 (StandardRule interface の最小集合のみ)
    const { data: rule } = await admin
      .from("standard_rules")
      .select("id, category, category_label, required_photos, required_fields, warning_rules, standard_level")
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
      await admin.from("certificate_quality_scores").upsert(
        {
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
        },
        { onConflict: "certificate_id" },
      );

      // 品質スコア80以上・写真4枚以上なら Academy候補フラグ
      if (audit.score >= 80 && (photo_urls?.length ?? 0) >= 4) {
        await admin.from("academy_cases").upsert(
          {
            certificate_id,
            tenant_id: caller.tenantId,
            category,
            quality_score: audit.score,
            is_candidate: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "certificate_id" },
        );
      }
    }

    return apiOk({ audit });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
