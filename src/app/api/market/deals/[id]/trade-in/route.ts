import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";
import { dealTradeInSchema } from "@/lib/validations/market";

export const dynamic = "force-dynamic";

// ─── PATCH: 商談に下取り車・充当額を設定する ───
// trade_in_vehicle_id は自テナントの在庫 (market_vehicles) のみ許可。
// null を渡すと下取りを解除する。
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: dealId } = await params;
    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const parsed = dealTradeInSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { trade_in_vehicle_id, trade_in_allowance } = parsed.data;

    // 商談が自テナントのものか確認。
    const { data: deal, error: dealErr } = await admin
      .from("market_deals")
      .select("id, seller_tenant_id")
      .eq("id", dealId)
      .eq("seller_tenant_id", tenantId)
      .single();
    if (dealErr || !deal) return apiNotFound("deal_not_found");

    // 下取り車を指定する場合は自テナント所有の在庫であることを確認。
    if (trade_in_vehicle_id) {
      const { data: veh, error: vehErr } = await admin
        .from("market_vehicles")
        .select("id, tenant_id")
        .eq("id", trade_in_vehicle_id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (vehErr) return apiInternalError(vehErr, "market-deal trade-in (vehicle lookup)");
      if (!veh) return apiValidationError("対象の下取り車が見つかりません。");
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (trade_in_vehicle_id !== undefined) updates.trade_in_vehicle_id = trade_in_vehicle_id;
    if (trade_in_allowance !== undefined) updates.trade_in_allowance = trade_in_allowance;

    const { data: updated, error: updateErr } = await admin
      .from("market_deals")
      .update(updates)
      .eq("id", dealId)
      .eq("seller_tenant_id", tenantId)
      .select("id, trade_in_vehicle_id, trade_in_allowance, updated_at")
      .single();
    if (updateErr) return apiInternalError(updateErr, "market-deal trade-in");

    return apiJson({ ok: true, deal: updated });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deal trade-in");
  }
}
