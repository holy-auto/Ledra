/**
 * POST /api/admin/certificates/ai-draft
 * 施工証明書の自動下書き生成（B-1）
 * minPlan: standard
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateCertificateDraft } from "@/lib/ai/draftCertificate";
import { modelForPlanTier } from "@/lib/ai/client";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { loadAiAutomationSettings, filterDraftByPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { CERT_AI_COLUMNS, certAiFields } from "@/lib/certificates/aiFields";

const aiDraftSchema = z
  .object({
    vehicle_id: z.string().uuid().optional(),
    hearing_id: z.string().uuid().optional(),
    photo_urls: z.array(z.string().url()).max(20).optional(),
    template_category: z.string().trim().max(100).optional(),
  })
  .refine((v) => !!v.vehicle_id || !!v.hearing_id, {
    message: "vehicle_id または hearing_id が必要です",
  });

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    // Standard以上のみ
    if (!canUseFeature(caller.planTier, "ai_draft")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます", {
        code: "plan_limit",
      });
    }

    // 証明書ドラフト生成は呼ぶたびに AI 費用が出る。
    // プラン判定より後に置く。Free のテナントには 429 ではなく案内を返したい。
    const limited = await checkRateLimit(req, "ai", `cert-ai-draft:${caller.tenantId}`);
    if (limited) return limited;

    const parsed = aiDraftSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { vehicle_id, hearing_id, photo_urls, template_category } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // テナントの AI 自動入力ポリシーをロード。グローバル OFF の場合は
    // モデル呼び出しすら走らせない (コスト・レイテンシ削減)。
    const automation = await loadAiAutomationSettings(caller.tenantId);
    if (!automation.enabled) {
      return apiOk({
        draft: {
          title: "",
          description: "",
          materials: [],
          warrantyCandidates: [],
          workAreas: [],
          cautions: "",
          confidence: 0,
          missingInfo: ["テナント設定で AI 自動入力が OFF になっています。"],
        },
        policies: {},
        source_data: { similar_certs_used: 0, photos_analyzed: 0, hearing_used: false },
        ai_disabled: true,
      });
    }

    // 車両情報取得
    let vehicle: Record<string, unknown> = {};
    if (vehicle_id) {
      const { data } = await admin
        .from("vehicles")
        .select("maker, model, year, vin_code")
        .eq("id", vehicle_id)
        .eq("tenant_id", caller.tenantId)
        .single();
      vehicle = data ?? {};
    }

    // ヒアリング情報取得 (ソースが許可されている場合のみ)
    let hearing: Record<string, unknown> | undefined;
    if (hearing_id && isSourceAllowed(automation, "hearings")) {
      const { data } = await admin
        .from("hearings")
        .select(
          "service_type, budget_range, parking_environment, additional_requests, vehicle_maker, vehicle_model, vehicle_year, vehicle_color",
        )
        .eq("id", hearing_id)
        .eq("tenant_id", caller.tenantId)
        .single();
      if (data) {
        hearing = data;
        // ヒアリングから車両情報も補完
        if (!vehicle.maker)
          vehicle = {
            maker: data.vehicle_maker,
            model: data.vehicle_model,
            year: data.vehicle_year,
            color: data.vehicle_color,
          };
      }
    }

    // 同テナントの類似施工事例 (ソースが許可されている場合のみ取得)
    const allowSimilar = isSourceAllowed(automation, "similar_certificates");
    const { data: similar } = allowSimilar
      ? await admin
          .from("certificates")
          .select(CERT_AI_COLUMNS)
          .eq("tenant_id", caller.tenantId)
          .not("service_type", "is", null)
          .order("created_at", { ascending: false })
          .limit(5)
      : { data: [] as Array<Record<string, unknown>> };

    const draft = await generateCertificateDraft(
      {
        vehicle: {
          maker: vehicle.maker as string | undefined,
          model: vehicle.model as string | undefined,
          year: vehicle.year as number | undefined,
          vin: vehicle.vin_code as string | undefined,
        },
        hearing: hearing
          ? {
              // hearings.service_type は単数の text。AI 側は配列を取る
              service_types: hearing.service_type ? [hearing.service_type as string] : undefined,
              budget_range: hearing.budget_range as string | undefined,
              parking_type: hearing.parking_environment as string | undefined,
              customer_requests: hearing.additional_requests as string | undefined,
            }
          : undefined,
        similarCertificates: (similar ?? []).map((s) => ({
          ...certAiFields(s),
        })),
        photoDescriptions: undefined, // Vision解析は別途
        templateCategory: template_category,
      },
      { model: modelForPlanTier(caller.planTier) },
    );

    const filtered = filterDraftByPolicy(draft, automation);

    return apiOk({
      draft: filtered.draft,
      policies: filtered.policies,
      source_data: {
        similar_certs_used: similar?.length ?? 0,
        photos_analyzed: isSourceAllowed(automation, "photos") ? (photo_urls?.length ?? 0) : 0,
        hearing_used: !!hearing,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e);
  }
}
