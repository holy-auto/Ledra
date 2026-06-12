import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import {
  partsOrderCreateSchema,
  partsOrderUpdateSchema,
  PARTS_ORDER_STATUS_FILTERS,
  type PartsOrderStatusFilter,
} from "@/lib/validations/parts-order";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 一覧 / 詳細で返すカラム。reservations を join して案件タイトルを表示する。
 */
const SELECT_COLUMNS = `
  id, reservation_id, part_name, part_number, supplier, quantity, unit_price,
  status, ordered_at, expected_at, received_at, notes, created_at, updated_at,
  reservation:reservations ( id, title, scheduled_date )
`;

/** 今日の日付 (YYYY-MM-DD)。 */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── GET: 部品発注一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "all").trim();
    const status: PartsOrderStatusFilter = (PARTS_ORDER_STATUS_FILTERS as readonly string[]).includes(statusParam)
      ? (statusParam as PartsOrderStatusFilter)
      : "all";
    const reservationId = (url.searchParams.get("reservation_id") ?? "").trim();
    const overdueOnly = url.searchParams.get("overdue_only") === "true";

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("parts_orders")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("expected_at", { ascending: true, nullsFirst: false })
      .order("ordered_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (status !== "all") query = query.eq("status", status);
    if (reservationId) query = query.eq("reservation_id", reservationId);
    if (overdueOnly) {
      // 入荷予定日を過ぎていて、まだ入荷 / キャンセルされていないもの。
      query = query.lt("expected_at", today()).in("status", ["ordered", "partial"]);
    }

    const { data: orders, error } = await query;
    if (error) return apiInternalError(error, "parts-orders GET");

    return apiJson({ orders: orders ?? [] });
  } catch (e) {
    return apiInternalError(e, "parts-orders GET");
  }
}

// ─── POST: 部品発注作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = partsOrderCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { reservation_id, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // クライアント供給 reservation_id をそのまま信頼しない: 自テナント所属を検証。
    if (reservation_id) {
      const refError = await validateReservation(admin, caller.tenantId, reservation_id);
      if (refError) return apiValidationError(refError);
    }

    const { data: created, error } = await admin
      .from("parts_orders")
      .insert({
        tenant_id: caller.tenantId,
        reservation_id,
        part_name: rest.part_name,
        part_number: rest.part_number,
        supplier: rest.supplier,
        quantity: rest.quantity,
        unit_price: rest.unit_price,
        status: rest.status,
        ordered_at: rest.ordered_at ?? today(),
        expected_at: rest.expected_at,
        received_at: rest.status === "received" ? today() : null,
        notes: rest.notes,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "parts-orders POST");

    return apiJson({ ok: true, order: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "parts-orders POST");
  }
}

// ─── PATCH: 部品発注更新 (body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = partsOrderUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, reservation_id, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (reservation_id) {
      const refError = await validateReservation(admin, caller.tenantId, reservation_id);
      if (refError) return apiValidationError(refError);
    }

    // 部分更新: undefined のキーは送らない（null は明示的にクリア）。
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (reservation_id !== undefined) updates.reservation_id = reservation_id;

    // status -> 'received' のとき received_at 未指定なら自動で今日をセット。
    if (fields.status === "received" && fields.received_at == null) {
      updates.received_at = today();
    }

    const { data: updated, error } = await admin
      .from("parts_orders")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "parts-orders PATCH");
    if (!updated) return apiValidationError("対象の発注が見つかりません。");

    return apiJson({ ok: true, order: updated });
  } catch (e) {
    return apiInternalError(e, "parts-orders PATCH");
  }
}

/**
 * reservation_id が caller のテナントに属するかを検証する。
 * 属さない / 存在しない場合はエラーメッセージを返す。
 */
async function validateReservation(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  reservationId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("reservations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "指定された案件が見つかりません。";
  return null;
}
