/**
 * POST /api/admin/inventory/ai-pos-deduct
 *
 * POS チェックアウト後の在庫引落候補を返す。
 * 入力: 売れた menu_item と数量
 * 出力: SKU 単位の suggested deductions (link / history / ai / skipped)
 *
 * クライアント側で確認 → /api/admin/inventory/movements に POST して
 * 実在庫を減らす想定 (本ルートは読み取り推定のみ)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiPlanLimit, apiForbidden } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { suggestPosDeductions } from "@/lib/ai/posInventoryDeduction";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

const schema = z.object({
  sales: z
    .array(
      z.object({
        menu_item_id: z.string().uuid(),
        menu_item_name: z.string().min(1).max(200),
        service_category: z.string().max(100).nullable().optional(),
        sold_quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(req: NextRequest) {
  const usage = startAiRouteUsage("/api/admin/inventory/ai-pos-deduct");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();
    if (!canUseFeature(caller.planTier, "ai_pos_deduction")) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "plan_limit" });
      return apiPlanLimit("AI 在庫引落推定は Standard プラン以上でご利用いただけます。");
    }

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "schema_error" });
      return parsed.response;
    }

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled || resolveFieldPolicy(settings, "inventory.pos_deduction") === "manual") {
      usage.record({ tenantId: caller.tenantId, userId: caller.userId, outcome: "ai_disabled" });
      return apiOk({ ai_disabled: true, suggestions: [] });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 在庫 / 紐付け / 消費統計テーブルは別 migration で追加予定。
    // 未マイグレーション環境では graceful degrade して空 suggestion を返す。
    const [skusRes, linksRes, historyRes] = await Promise.all([
      // schema-check-ignore: 未作成のテーブル。下の isMissingTableError で縮退する
      admin.from("inventory_skus").select("id, name, category, unit").eq("tenant_id", tenantId),
      admin
        // schema-check-ignore: 未作成のテーブル。下の isMissingTableError で縮退する
        .from("menu_item_inventory_links")
        .select("menu_item_id, sku_id, quantity")
        .eq("tenant_id", tenantId)
        .in(
          "menu_item_id",
          parsed.data.sales.map((s) => s.menu_item_id),
        ),
      admin
        // schema-check-ignore: 未作成のテーブル。下の isMissingTableError で縮退する
        .from("inventory_consumption_stats")
        .select("service_category, sku_id, avg_quantity")
        .eq("tenant_id", tenantId),
    ]);

    const skusMissing = isMissingTableError(skusRes.error);
    const linksMissing = isMissingTableError(linksRes.error);
    const historyMissing = isMissingTableError(historyRes.error);

    if (skusMissing) {
      usage.record({
        tenantId: caller.tenantId,
        userId: caller.userId,
        outcome: "ok",
        meta: { warning: "schema_missing" },
      });
      return apiOk({
        ai_disabled: false,
        suggestions: [],
        ai: false,
        warning: "在庫マスター (inventory_skus) が未作成のため、引落候補を計算できません。",
      });
    }

    const result = await suggestPosDeductions(
      {
        sales: parsed.data.sales.map((s) => ({
          menu_item_id: s.menu_item_id,
          menu_item_name: s.menu_item_name,
          service_category: s.service_category ?? null,
          sold_quantity: s.sold_quantity,
        })),
        skus: (skusRes.data ?? []) as Array<{ id: string; name: string; category: string | null; unit: string | null }>,
        links: (linksMissing ? [] : (linksRes.data ?? [])) as Array<{
          menu_item_id: string;
          sku_id: string;
          quantity: number;
        }>,
        history: (historyMissing ? [] : (historyRes.data ?? [])) as Array<{
          service_category: string | null;
          sku_id: string;
          avg_quantity: number;
        }>,
      },
      { model: fastModelForPlanTier(caller.planTier) },
    );

    usage.record({
      tenantId: caller.tenantId,
      userId: caller.userId,
      outcome: "ok",
      meta: { ai: result.ai, suggestion_count: result.suggestions.length },
    });

    return apiOk({ ai_disabled: false, suggestions: result.suggestions, ai: result.ai });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "inventory ai-pos-deduct");
  }
}

function isMissingTableError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache");
}
