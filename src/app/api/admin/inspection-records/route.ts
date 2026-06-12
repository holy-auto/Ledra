import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { inspectionRecordCreateSchema, inspectionRecordUpdateSchema } from "@/lib/validations/inspection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧 / 詳細で返すカラム。vehicles / inspection_templates を join する。
 * vehicles の実カラムは plate_display / maker / model（core_tables.sql 参照）。
 */
const SELECT_COLUMNS = `
  id, template_id, reservation_id, vehicle_id, customer_id, inspection_type,
  answers, photo_urls, template_name, template_items, inspector_name,
  inspected_at, notes, created_at, updated_at,
  vehicle:vehicles ( id, maker, model, plate_display ),
  template:inspection_templates ( id, name )
`;

// ─── GET: 点検記録一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const reservationId = (url.searchParams.get("reservation_id") ?? "").trim();
    const vehicleId = (url.searchParams.get("vehicle_id") ?? "").trim();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("inspection_records")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("inspected_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (reservationId) query = query.eq("reservation_id", reservationId);
    if (vehicleId) query = query.eq("vehicle_id", vehicleId);

    const { data: records, error } = await query;
    if (error) return apiInternalError(error, "inspection-records GET");

    return apiJson({ records: records ?? [] });
  } catch (e) {
    return apiInternalError(e, "inspection-records GET");
  }
}

// ─── POST: 点検記録作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = inspectionRecordCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { template_id, reservation_id, vehicle_id, customer_id, inspected_at, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // クライアント供給 ID をそのまま信頼しない: 自テナント所属を検証。
    const refError = await validateTenantRefs(admin, caller.tenantId, {
      template_id,
      reservation_id,
      vehicle_id,
      customer_id,
    });
    if (refError) return apiValidationError(refError);

    // template_id が指定されていれば、履歴保全のためテンプレ名 / 項目を snapshot する。
    let templateName: string | null = null;
    let templateItems: unknown[] = [];
    if (template_id) {
      const { data: tpl, error: tplErr } = await admin
        .from("inspection_templates")
        .select("name, items")
        .eq("tenant_id", caller.tenantId)
        .eq("id", template_id)
        .maybeSingle();
      if (tplErr) return apiInternalError(tplErr, "inspection-records POST template snapshot");
      if (tpl) {
        templateName = (tpl as { name: string | null }).name ?? null;
        const items = (tpl as { items: unknown }).items;
        templateItems = Array.isArray(items) ? items : [];
      }
    }

    const { data: created, error } = await admin
      .from("inspection_records")
      .insert({
        tenant_id: caller.tenantId,
        template_id,
        reservation_id,
        vehicle_id,
        customer_id,
        inspection_type: rest.inspection_type,
        answers: rest.answers,
        photo_urls: rest.photo_urls,
        template_name: templateName,
        template_items: templateItems,
        inspector_name: rest.inspector_name,
        inspected_at: inspected_at ?? new Date().toISOString(),
        notes: rest.notes,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "inspection-records POST");

    return apiJson({ ok: true, record: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "inspection-records POST");
  }
}

// ─── PATCH: 点検記録更新 (body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = inspectionRecordUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, template_id, reservation_id, vehicle_id, customer_id, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const refError = await validateTenantRefs(admin, caller.tenantId, {
      template_id: template_id ?? null,
      reservation_id: reservation_id ?? null,
      vehicle_id: vehicle_id ?? null,
      customer_id: customer_id ?? null,
    });
    if (refError) return apiValidationError(refError);

    // 部分更新: undefined のキーは送らない（null は明示的にクリア）。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (template_id !== undefined) updates.template_id = template_id;
    if (reservation_id !== undefined) updates.reservation_id = reservation_id;
    if (vehicle_id !== undefined) updates.vehicle_id = vehicle_id;
    if (customer_id !== undefined) updates.customer_id = customer_id;

    const { data: updated, error } = await admin
      .from("inspection_records")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "inspection-records PATCH");
    if (!updated) return apiValidationError("対象の点検記録が見つかりません。");

    return apiJson({ ok: true, record: updated });
  } catch (e) {
    return apiInternalError(e, "inspection-records PATCH");
  }
}

/**
 * 指定された ID 群が caller のテナントに属するかを検証する。
 * 属さない / 存在しない場合はエラーメッセージを返す。null はスキップ。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: {
    template_id?: string | null;
    reservation_id?: string | null;
    vehicle_id?: string | null;
    customer_id?: string | null;
  },
): Promise<string | null> {
  const checks: { table: string; id: string | null | undefined; label: string }[] = [
    { table: "inspection_templates", id: refs.template_id, label: "点検テンプレート" },
    { table: "reservations", id: refs.reservation_id, label: "予約" },
    { table: "vehicles", id: refs.vehicle_id, label: "車両" },
    { table: "customers", id: refs.customer_id, label: "顧客" },
  ];
  for (const c of checks) {
    if (!c.id) continue;
    const { data, error } = await admin
      .from(c.table)
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", c.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return `指定された${c.label}が見つかりません。`;
  }
  return null;
}
