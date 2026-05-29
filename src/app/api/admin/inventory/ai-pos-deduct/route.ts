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
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { suggestPosDeductions } from "@/lib/ai/posInventoryDeduction";
import { loadAiAutomationSettings, resolveFieldPolicy } from "@/lib/ai/automation/policy";

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
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = await parseJsonBody(req, schema);
    if (!parsed.ok) return parsed.response;

    const settings = await loadAiAutomationSettings(caller.tenantId);
    if (!settings.enabled || resolveFieldPolicy(settings, "inventory.pos_deduction") === "manual") {
      return apiOk({ ai_disabled: true, suggestions: [] });
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const [skusRes, linksRes, historyRes] = await Promise.all([
      admin.from("inventory_skus").select("id, name, category, unit").eq("tenant_id", tenantId),
      admin
        .from("menu_item_inventory_links")
        .select("menu_item_id, sku_id, quantity")
        .eq("tenant_id", tenantId)
        .in("menu_item_id", parsed.data.sales.map((s) => s.menu_item_id)),
      admin
        .from("inventory_consumption_stats")
        .select("service_category, sku_id, avg_quantity")
        .eq("tenant_id", tenantId),
    ]);

    const result = await suggestPosDeductions({
      sales: parsed.data.sales.map((s) => ({
        menu_item_id: s.menu_item_id,
        menu_item_name: s.menu_item_name,
        service_category: s.service_category ?? null,
        sold_quantity: s.sold_quantity,
      })),
      skus: (skusRes.data ?? []) as Array<{ id: string; name: string; category: string | null; unit: string | null }>,
      links: (linksRes.data ?? []) as Array<{ menu_item_id: string; sku_id: string; quantity: number }>,
      history: (historyRes.data ?? []) as Array<{
        service_category: string | null;
        sku_id: string;
        avg_quantity: number;
      }>,
    });

    return apiOk({ ai_disabled: false, suggestions: result.suggestions, ai: result.ai });
  } catch (e: unknown) {
    return apiInternalError(e, "inventory ai-pos-deduct");
  }
}
