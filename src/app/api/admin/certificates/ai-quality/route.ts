/**
 * POST /api/admin/certificates/ai-quality
 * 撮影ガイドと抜け漏れ検知（B-3）
 * minPlan: free（全プランで基本チェック可能）
 * Vision AI チェックは standard 以上
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { normalizePlanTier, canUseFeature } from "@/lib/billing/planFeatures";
import { visionModelForPlanTier } from "@/lib/ai/client";
import { auditCertificatePhotos, decideGate, type StandardRule } from "@/lib/ai/photoQualityCheck";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

const aiQualitySchema = z.object({
  certificate_id: z.string().uuid().optional(),
  category: z.string().trim().min(1, "category が必要です").max(100),
  photo_urls: z.array(z.string().url()).max(50).optional(),
  /**
   * 発行前ゲート用のショートカット。フォーム入力中はまだ写真をアップロードして
   * いないため URL は無いが、枚数だけは判定したい。precheck=true のときだけ
   * photo_urls の代わりにこのカウントを使う。
   */
  photo_count: z.number().int().min(0).max(50).optional(),
  field_values: z.record(z.string(), z.string()).optional(),
  /**
   * true のとき: Vision を呼ばず、ルールベース監査のみ実行。DB にも書き込まない。
   * 発行ボタンの直前でブロック判定するための軽量モード。
   */
  precheck: z.boolean().optional(),
});

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/certificates/ai-quality");
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // Vision AI (Anthropic) を最大 50 枚分呼び出すため、テナント単位で
    // レートリミットを掛けて課金爆発を防ぐ。
    const limited = await checkRateLimit(req, "ai", `ai-quality:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = aiQualitySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { certificate_id, category, photo_urls, photo_count, field_values, precheck } = parsed.data;

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
      const audit = {
        certificateId: certificate_id ?? "",
        category,
        overallStatus: "pass" as const,
        standardLevel: "basic" as const,
        score: 70,
        photoResults: [],
        missingPhotos: [],
        missingFields: [],
        warningMessages: [],
      };
      return apiOk({ audit, gate: decideGate(audit) });
    }

    // precheck モードのときは枚数のみ・Vision なしでルールベース監査
    // (発行ボタン直前のブロック判定用)。
    const tier = normalizePlanTier(caller.planTier);
    // AI マスタースイッチ OFF / 月次コストキャップ超過時は settings.enabled=false に
    // 倒るので、Vision (課金) を呼ばずルールベース監査だけにフォールバックする。
    const aiSettings = precheck ? null : await loadAiAutomationSettings(caller.tenantId);
    const useVision = !precheck && canUseFeature(tier, "ai_quality_vision") && aiSettings?.enabled === true;

    // precheck では photo_count を photo_urls.length 相当として扱う
    const effectivePhotoUrls =
      precheck && photo_count != null
        ? Array.from({ length: photo_count }, (_, i) => `precheck://photo-${i}`)
        : (photo_urls ?? []);

    const audit = await auditCertificatePhotos({
      certificateId: certificate_id ?? "",
      category,
      photoUrls: effectivePhotoUrls,
      fieldValues: field_values ?? {},
      standardRule: rule as StandardRule,
      checkPhotosWithAI: useVision,
      model: visionModelForPlanTier(tier),
    });

    // 実際に呼んだ (キャッシュミスの) Vision のトークンを usageContext が捕捉済み。
    // ok で記録すると recordRouteUsage がモデル別単価で実コストを月次キャップに加算する。
    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: useVision ? "ok" : "ai_disabled",
      meta: { photos: audit.photoResults.length, status: audit.overallStatus, vision: useVision },
    });

    // 結果をDBにキャッシュ (precheck では DB を汚さない)
    if (!precheck && certificate_id) {
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

    return apiOk({ audit, gate: decideGate(audit) });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e);
  }
}
