/**
 * POST /api/admin/market-vehicles/[id]/ai-description
 *
 * 中古車マーケットの物件説明文 + 特徴タグを Vision (or text-only) で生成。
 * クライアントが結果を受け取り、market_vehicles の description / features に
 * 流して保存する想定。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { generateMarketVehicleDescription } from "@/lib/ai/marketVehicleDescription";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy, isSourceAllowed } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const schema = z.object({
  seller_notes: z.string().max(1000).optional(),
  photo_urls: z.array(z.string().url()).max(3).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/market-vehicles/[id]/ai-description");
  try {
    // Vision を呼ぶため、admin/translate (text-only) より厳しめの ai プリセット
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("market_vehicle id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_market_description")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 物件説明文生成は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, description: null });
    }

    const descPolicy = resolveFieldPolicy(settings, "market_vehicle.description");
    const featuresPolicy = resolveFieldPolicy(settings, "market_vehicle.features");
    if (descPolicy === "manual" && featuresPolicy === "manual") {
      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ai_disabled",
        meta: { reason: "policy_manual" },
      });
      return apiOk({ ai_disabled: false, description: null, skipped: "policy is manual" });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // market_vehicles の走行距離カラムは `mileage` (km 単位、integer)
    const { data: vehicle, error: vErr } = await admin
      .from("market_vehicles")
      .select("id, maker, model, year, color, mileage, features")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (vErr) return apiInternalError(vErr, "market-vehicles ai-description: vehicle");
    if (!vehicle) return apiNotFound("market vehicle not found");

    const photoAllowed = isSourceAllowed(settings, "photos");
    const photoUrls = photoAllowed ? (parsed.data.photo_urls ?? []) : [];

    const result = await generateMarketVehicleDescription(
      {
        maker: vehicle.maker as string | null,
        model: vehicle.model as string | null,
        year: vehicle.year as number | null,
        color: vehicle.color as string | null,
        mileage_km: vehicle.mileage as number | null,
        features: Array.isArray(vehicle.features) ? (vehicle.features as string[]) : undefined,
        photo_urls: photoUrls,
        sellerNotes: parsed.data.seller_notes ?? null,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: result.confidence,
      meta: { ai: result.ai, with_photos: photoUrls.length > 0 },
    });

    return apiOk({
      ai_disabled: false,
      description: descPolicy === "manual" ? null : result.description,
      features: featuresPolicy === "manual" ? [] : result.features,
      confidence: result.confidence,
      ai: result.ai,
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "market-vehicles ai-description");
  }
}
