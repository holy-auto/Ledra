import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  tireStorageCreateSchema,
  tireStorageUpdateSchema,
  TIRE_STORAGE_STATUS_FILTERS,
  type TireStorageStatusFilter,
} from "@/lib/validations/tire-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * vehicles の実カラムは plate_display / maker / model (core_tables.sql 参照)。
 */
const SELECT_COLUMNS = `
  id, customer_id, vehicle_id, customer_name, vehicle_info,
  tire_type, tire_size, brand, quantity, storage_location,
  status, stored_at, returned_at, swap_month, notes,
  created_at, updated_at,
  customer:customers ( id, name ),
  vehicle:vehicles ( id, maker, model, plate_display )
`;

/** 顧客 / 車両の join から表示用スナップショットを組み立てる。 */
function buildVehicleInfo(v: { maker?: unknown; model?: unknown; plate_display?: unknown } | null): string | null {
  if (!v) return null;
  const parts = [v.maker, v.model, v.plate_display].map((x) => (x ? String(x) : "")).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

// ─── GET: 保管一覧 ───
// クエリ: status=stored|returned|all (既定 stored), swap_month=1..12 (リマインド用)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "stored").trim();
    const status: TireStorageStatusFilter = (TIRE_STORAGE_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as TireStorageStatusFilter)
      : "stored";

    const swapMonthRaw = (url.searchParams.get("swap_month") ?? "").trim();
    const swapMonth = swapMonthRaw ? Number(swapMonthRaw) : null;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("tire_storages")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (swapMonth != null && Number.isInteger(swapMonth) && swapMonth >= 1 && swapMonth <= 12) {
      query = query.eq("swap_month", swapMonth);
    }

    const { data: items, error } = await query;
    if (error) return apiInternalError(error, "tire-storage GET");

    return apiJson(
      { items: items ?? [] },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "tire-storage GET");
  }
}

// ─── POST: 保管記録作成 ───
// customer_id / vehicle_id があり名称未指定なら join からスナップショットを補完。
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = tireStorageCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const data = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 参照のテナント検証 + 名称スナップショット補完。
    let customerName = data.customer_name;
    if (data.customer_id) {
      const { data: cust, error } = await admin
        .from("customers")
        .select("name")
        .eq("tenant_id", caller.tenantId)
        .eq("id", data.customer_id)
        .maybeSingle();
      if (error) return apiInternalError(error, "tire-storage POST customer");
      if (!cust) return apiValidationError("指定された顧客が見つかりません。");
      if (!customerName) customerName = (cust.name as string | null) ?? null;
    }

    let vehicleInfo = data.vehicle_info;
    if (data.vehicle_id) {
      const { data: veh, error } = await admin
        .from("vehicles")
        .select("maker, model, plate_display")
        .eq("tenant_id", caller.tenantId)
        .eq("id", data.vehicle_id)
        .maybeSingle();
      if (error) return apiInternalError(error, "tire-storage POST vehicle");
      if (!veh) return apiValidationError("指定された車両が見つかりません。");
      if (!vehicleInfo) vehicleInfo = buildVehicleInfo(veh);
    }

    const { data: created, error } = await admin
      .from("tire_storages")
      .insert({
        ...data,
        customer_name: customerName,
        vehicle_info: vehicleInfo,
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "tire-storage POST");

    return apiJson({ ok: true, item: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "tire-storage POST");
  }
}

// ─── PATCH: 保管記録更新 (status / returned_at / storage_location / swap_month / notes 等) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = tireStorageUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, status, returned_at, ...fields } = parsed.data;

    // 部分更新: undefined のキーは送らない (null は明示的クリア)。
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (status !== undefined) {
      updates.status = status;
      // 返却 / 廃棄に遷移し returned_at 未指定なら本日を自動セット。
      // 保管中に戻したら returned_at をクリア。
      if (status === "stored") {
        updates.returned_at = null;
      } else if (returned_at === undefined) {
        updates.returned_at = new Date().toISOString().slice(0, 10);
      }
    }
    if (returned_at !== undefined) {
      updates.returned_at = returned_at;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新する項目がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: updated, error } = await admin
      .from("tire_storages")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "tire-storage PATCH");
    if (!updated) return apiValidationError("対象の保管記録が見つかりません。");

    return apiJson({ ok: true, item: updated });
  } catch (e) {
    return apiInternalError(e, "tire-storage PATCH");
  }
}
