import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  maintenancePackCreateSchema,
  maintenancePackUpdateSchema,
  MAINTENANCE_PACK_STATUS_FILTERS,
  type MaintenancePackStatusFilter,
} from "@/lib/validations/maintenance-pack";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧 / 詳細で返すカラム。customers / vehicles を join する。
 * vehicles の実カラムは plate_display / maker / model（registration_number /
 * make ではない — core_tables.sql 参照）。クライアント向けに別名で公開する。
 */
const SELECT_COLUMNS = `
  id, name, description, total_tickets, used_tickets, price,
  valid_from, valid_until, status, sold_at, notes, customer_id, vehicle_id,
  created_at, updated_at,
  customer:customers ( id, name ),
  vehicle:vehicles ( id, plate_display, maker, model )
`;

// ─── GET: メンテパック一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "active").trim();
    const status: MaintenancePackStatusFilter = (
      MAINTENANCE_PACK_STATUS_FILTERS as readonly string[]
    ).includes(statusParam)
      ? (statusParam as MaintenancePackStatusFilter)
      : "active";
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();
    const vehicleId = (url.searchParams.get("vehicle_id") ?? "").trim();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("maintenance_packs")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("sold_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);

    const { data: packs, error } = await query;
    if (error) return apiInternalError(error, "maintenance-packs GET");

    return apiJson({ packs: packs ?? [] });
  } catch (e) {
    return apiInternalError(e, "maintenance-packs GET");
  }
}

// ─── POST: メンテパック作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = maintenancePackCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { customer_id, vehicle_id, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // customer_id / vehicle_id が指定されている場合、自テナント所属を検証
    // (クライアント供給 ID をそのまま信頼しない)
    const refError = await validateTenantRefs(admin, caller.tenantId, { customer_id, vehicle_id });
    if (refError) return apiValidationError(refError);

    const { data: created, error } = await admin
      .from("maintenance_packs")
      .insert({
        ...rest,
        customer_id,
        vehicle_id,
        used_tickets: 0,
        status: "active",
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "maintenance-packs POST");

    return apiJson({ ok: true, pack: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "maintenance-packs POST");
  }
}

// ─── PATCH: メンテパック更新 (status 変更 / メモ更新等。body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = maintenancePackUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, customer_id, vehicle_id, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 部分更新: undefined のキーは送らない（null は「明示的にクリア」として扱う）
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (customer_id !== undefined) updates.customer_id = customer_id;
    if (vehicle_id !== undefined) updates.vehicle_id = vehicle_id;

    const refError = await validateTenantRefs(admin, caller.tenantId, {
      customer_id: customer_id ?? null,
      vehicle_id: vehicle_id ?? null,
    });
    if (refError) return apiValidationError(refError);

    const { data: updated, error } = await admin
      .from("maintenance_packs")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "maintenance-packs PATCH");
    if (!updated) return apiValidationError("対象のメンテパックが見つかりません。");

    return apiJson({ ok: true, pack: updated });
  } catch (e) {
    return apiInternalError(e, "maintenance-packs PATCH");
  }
}

/**
 * customer_id / vehicle_id が指定されている場合、それが caller のテナントに
 * 属するかを検証する。属さない / 存在しない場合はエラーメッセージを返す。
 * null の参照は検証スキップ (= 紐付けなし)。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: { customer_id: string | null; vehicle_id: string | null },
): Promise<string | null> {
  if (refs.customer_id) {
    const { data, error } = await admin
      .from("customers")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.customer_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された顧客が見つかりません。";
  }
  if (refs.vehicle_id) {
    const { data, error } = await admin
      .from("vehicles")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.vehicle_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された車両が見つかりません。";
  }
  return null;
}
