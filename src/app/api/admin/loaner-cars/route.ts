import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { loanerCarCreateSchema, loanerCarUpdateSchema } from "@/lib/validations/loaner-car";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CAR_COLUMNS = "id, name, plate_display, maker, model, year, color, notes, is_active, created_at, updated_at";

// ─── GET: 代車一覧 (現在の貸出状況付き) ───
// 各代車について、未返却 (returned_at IS NULL) の最新貸出を current_loan として付与する。
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: cars, error } = await admin
      .from("loaner_cars")
      .select(CAR_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "loaner-cars GET");

    const carIds = (cars ?? []).map((c) => c.id as string);

    // 未返却の貸出を取得して代車ごとにマップ。
    const loanByCar = new Map<
      string,
      { customer_name: string | null; return_due_at: string | null; reservation_id: string | null; lent_at: string }
    >();
    if (carIds.length > 0) {
      const { data: loans, error: loanErr } = await admin
        .from("loaner_car_loans")
        .select("loaner_car_id, customer_name, return_due_at, reservation_id, lent_at")
        .eq("tenant_id", caller.tenantId)
        .is("returned_at", null)
        .in("loaner_car_id", carIds)
        .order("lent_at", { ascending: false });
      if (loanErr) return apiInternalError(loanErr, "loaner-cars GET loans");
      for (const l of loans ?? []) {
        const k = l.loaner_car_id as string;
        // order が lent_at desc なので最初に見つかったものが最新。
        if (!loanByCar.has(k)) {
          loanByCar.set(k, {
            customer_name: (l.customer_name as string | null) ?? null,
            return_due_at: (l.return_due_at as string | null) ?? null,
            reservation_id: (l.reservation_id as string | null) ?? null,
            lent_at: l.lent_at as string,
          });
        }
      }
    }

    const decorated = (cars ?? []).map((c) => ({
      ...c,
      current_loan: loanByCar.get(c.id as string) ?? null,
    }));

    return apiJson(
      { cars: decorated },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "loaner-cars GET");
  }
}

// ─── POST: 代車登録 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = loanerCarCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: created, error } = await admin
      .from("loaner_cars")
      .insert({ ...parsed.data, tenant_id: caller.tenantId })
      .select(CAR_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "loaner-cars POST");

    return apiJson({ ok: true, car: { ...created, current_loan: null } }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "loaner-cars POST");
  }
}

// ─── PATCH: 代車更新 (フィールド / is_active) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = loanerCarUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」)。
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新する項目がありません。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: updated, error } = await admin
      .from("loaner_cars")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(CAR_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "loaner-cars PATCH");
    if (!updated) return apiValidationError("対象の代車が見つかりません。");

    return apiJson({ ok: true, car: updated });
  } catch (e) {
    return apiInternalError(e, "loaner-cars PATCH");
  }
}
