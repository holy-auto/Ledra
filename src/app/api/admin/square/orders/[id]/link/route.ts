import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiValidationError,
} from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── PUT: Square オーダーを顧客/車両/証明書にリンク ───
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const { id } = await params;
    if (!id) return apiValidationError("オーダーIDが必要です。");

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const { customer_id, vehicle_id, certificate_id, note } = body as {
      customer_id?: string;
      vehicle_id?: string;
      certificate_id?: string;
      note?: string;
    };

    const admin = getAdminClient();

    // オーダーの存在確認（テナントスコープ）
    const { data: existing } = await admin
      .from("square_orders")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!existing) {
      return apiNotFound("指定されたSquareオーダーが見つかりません。");
    }

    // 更新するフィールドを構築
    const updates: Record<string, unknown> = {};
    if (customer_id !== undefined) updates.customer_id = customer_id || null;
    if (vehicle_id !== undefined) updates.vehicle_id = vehicle_id || null;
    if (certificate_id !== undefined) updates.certificate_id = certificate_id || null;
    if (note !== undefined) updates.note = note || null;

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新するフィールドを指定してください。");
    }

    const { data: updated, error: updateErr } = await admin
      .from("square_orders")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, square_order_id, square_location_id, order_state, total_amount, currency, square_created_at, customer_id, vehicle_id, certificate_id, note",
      )
      .single();

    if (updateErr) {
      console.error("[square order link] update error:", updateErr.message);
      return apiInternalError(updateErr, "square order link PUT");
    }

    return apiOk({ order: updated });
  } catch (e) {
    return apiInternalError(e, "square order link PUT");
  }
}
