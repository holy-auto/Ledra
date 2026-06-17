import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { stocktakeItemUpdateSchema } from "@/lib/validations/stocktake";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET: セッションの明細一覧 (menu_items 結合 + 差異算出) ───
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { id: sessionId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    // セッションが自テナントのものか確認 (RLS でも担保されるが 404 を明示)
    const { data: session } = await supabase
      .from("stocktake_sessions")
      .select("id, name, status, started_at, closed_at, notes")
      .eq("id", sessionId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!session) return apiNotFound("棚卸セッションが見つかりません。");

    const { data: items, error } = await supabase
      .from("stocktake_items")
      .select("id, menu_item_id, expected_qty, counted_qty, unit, notes, created_at, updated_at")
      .eq("tenant_id", caller.tenantId)
      .eq("session_id", sessionId);
    if (error) return apiInternalError(error, "stocktake items GET");

    // menu_items の名称・単価を並列取得して結合
    const menuItemIds = [...new Set((items ?? []).map((i) => i.menu_item_id).filter(Boolean))];
    const menuMap: Record<string, { name: string; unit_price: number | null }> = {};
    if (menuItemIds.length > 0) {
      const { data: menuItems } = await supabase
        .from("menu_items")
        .select("id, name, unit_price")
        .eq("tenant_id", caller.tenantId)
        .in("id", menuItemIds);
      for (const mi of menuItems ?? []) {
        menuMap[mi.id] = { name: mi.name, unit_price: mi.unit_price };
      }
    }

    const enriched = (items ?? [])
      .map((it) => {
        const expected = Number(it.expected_qty ?? 0);
        const counted = it.counted_qty == null ? null : Number(it.counted_qty);
        return {
          ...it,
          expected_qty: expected,
          counted_qty: counted,
          menu_item_name: menuMap[it.menu_item_id]?.name ?? "(削除済み品目)",
          unit_price: menuMap[it.menu_item_id]?.unit_price ?? null,
          // 差異は実測済みのときのみ算出
          discrepancy: counted == null ? null : counted - expected,
        };
      })
      .sort((a, b) => a.menu_item_name.localeCompare(b.menu_item_name, "ja"));

    return apiJson({ session, items: enriched });
  } catch (e) {
    return apiInternalError(e, "stocktake items GET");
  }
}

// ─── PATCH: 1 明細の実測数 / メモ更新 ───
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const { id: sessionId } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = stocktakeItemUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { item_id, counted_qty, notes } = parsed.data;

    // 締め済みセッションは編集不可
    const { data: session } = await supabase
      .from("stocktake_sessions")
      .select("status")
      .eq("id", sessionId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!session) return apiNotFound("棚卸セッションが見つかりません。");
    if (session.status === "closed") {
      return apiValidationError("締め済みの棚卸は編集できません。");
    }

    const updates: Record<string, unknown> = {};
    if (counted_qty !== undefined) updates.counted_qty = counted_qty;
    if (notes !== undefined) updates.notes = notes;
    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新内容がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("stocktake_items")
      .update(updates)
      .eq("id", item_id)
      .eq("session_id", sessionId)
      .eq("tenant_id", caller.tenantId)
      .select("id, menu_item_id, expected_qty, counted_qty, unit, notes, updated_at")
      .single();

    if (error) return apiInternalError(error, "stocktake items PATCH");
    if (!data) return apiNotFound("明細が見つかりません。");

    const expected = Number(data.expected_qty ?? 0);
    const counted = data.counted_qty == null ? null : Number(data.counted_qty);
    return apiJson({
      ok: true,
      item: {
        ...data,
        expected_qty: expected,
        counted_qty: counted,
        discrepancy: counted == null ? null : counted - expected,
      },
    });
  } catch (e) {
    return apiInternalError(e, "stocktake items PATCH");
  }
}
