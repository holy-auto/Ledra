/**
 * POST /api/admin/menu-items/[id]/ai-price
 *
 * 指定メニューの推奨価格を返す。
 * - 自店過去販売単価 (invoices.items_json から description 一致で抽出)
 * - 業界中央値 (price_stats からカテゴリ平均)
 * - 任意でリクエストボディに vehicle_size を渡せば車両サイズ係数適用
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
import { estimateMenuPrice } from "@/lib/ai/menuPriceEstimate";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  vehicle_size: z.string().max(20).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/admin/menu-items/[id]/ai-price");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("menu_item id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_menu_price")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 推奨価格は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled || resolveFieldPolicy(settings, "menu.recommended_price") === "manual") {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, recommendation: null });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: menuItem, error: mErr } = await admin
      .from("menu_items")
      .select("id, name, category_large")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (mErr) return apiInternalError(mErr, "menu ai-price: menu");
    if (!menuItem) return apiNotFound("menu item not found");

    const { data: invoices } = await admin
      .from("invoices")
      .select("items_json")
      .eq("tenant_id", tenantId)
      .order("issued_at", { ascending: false })
      .limit(50);

    const ownSales: number[] = [];
    for (const inv of (invoices ?? []) as Array<{ items_json: unknown }>) {
      if (!Array.isArray(inv.items_json)) continue;
      for (const item of inv.items_json as Array<Record<string, unknown>>) {
        const desc = typeof item.description === "string" ? item.description : "";
        const price = typeof item.unit_price === "number" ? item.unit_price : 0;
        if (price > 0 && desc.includes(menuItem.name as string)) ownSales.push(price);
      }
    }

    // price_stats テーブルは未実装。将来 cron で集計テーブルを作るまでは null。
    // 自店過去販売価格 (ownSales) だけで baseline を出す。
    const marketMedian: number | null = null;

    const recommendation = await estimateMenuPrice(
      {
        menuName: menuItem.name as string,
        vehicleSize: parsed.data.vehicle_size,
        ownSales,
        marketMedian,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      confidence: recommendation.confidence,
      meta: { ai: recommendation.ai, samples: ownSales.length },
    });
    return apiOk({ ai_disabled: false, recommendation });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "menu ai-price");
  }
}
