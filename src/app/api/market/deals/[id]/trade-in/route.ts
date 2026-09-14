import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiNotFound,
  apiValidationError,
  apiInternalError,
  apiForbidden,
} from "@/lib/api/response";
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
    if (!requirePermission(caller, "market:edit")) return apiForbidden();

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
      .select("id, seller_tenant_id, vehicle_id, trade_in_vehicle_id, trade_in_allowance")
      .eq("id", dealId)
      .eq("seller_tenant_id", tenantId)
      .single();
    if (dealErr || !deal) return apiNotFound("deal_not_found");

    // 部分更新のため、指定が無い項目は既存値を維持した「最終状態」を組み立てる。
    const finalVehicle =
      trade_in_vehicle_id !== undefined ? trade_in_vehicle_id : (deal.trade_in_vehicle_id as string | null);
    let finalAllowance =
      trade_in_allowance !== undefined ? trade_in_allowance : (deal.trade_in_allowance as number | null);

    // 販売対象の車両を自身の下取りには指定できない (在庫が二重に扱われるのを防ぐ)。
    if (finalVehicle && finalVehicle === deal.vehicle_id) {
      return apiValidationError("販売対象の車両を下取り車には指定できません。");
    }
    // 下取り車が無ければ充当額も持たない (解除時に金額が残って見積から差し引かれるのを防ぐ)。
    if (!finalVehicle) finalAllowance = null;

    // 下取り車を指定する場合は自テナント所有の在庫であることを確認。
    if (finalVehicle) {
      const { data: veh, error: vehErr } = await admin
        .from("market_vehicles")
        .select("id")
        .eq("id", finalVehicle)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (vehErr) return apiInternalError(vehErr, "market-deal trade-in (vehicle lookup)");
      if (!veh) return apiValidationError("対象の下取り車が見つかりません。");
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      trade_in_vehicle_id: finalVehicle,
      trade_in_allowance: finalAllowance,
    };

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
