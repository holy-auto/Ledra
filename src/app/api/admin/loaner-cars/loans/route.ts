import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { loanerLoanCreateSchema, loanerLoanReturnSchema } from "@/lib/validations/loaner-car";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOAN_COLUMNS = `
  id, loaner_car_id, reservation_id, customer_id, body_repair_job_id, customer_name,
  lent_at, return_due_at, returned_at, notes, created_at, updated_at,
  loaner_car:loaner_cars ( id, name, plate_display ),
  customer:customers ( id, name ),
  reservation:reservations ( id, title, scheduled_date )
`;

// ─── GET: 貸出一覧 ───
// クエリ: car_id=, active_only=true|false (既定 true: 未返却のみ)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const carId = (url.searchParams.get("car_id") ?? "").trim();
    const jobId = (url.searchParams.get("body_repair_job_id") ?? "").trim();
    // active_only は明示的に "false" のときのみ false。既定 true。
    const activeOnly = url.searchParams.get("active_only") !== "false";

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    let query = admin
      .from("loaner_car_loans")
      .select(LOAN_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .order("lent_at", { ascending: false });

    if (carId) query = query.eq("loaner_car_id", carId);
    if (jobId) query = query.eq("body_repair_job_id", jobId);
    if (activeOnly) query = query.is("returned_at", null);

    const { data: loans, error } = await query;
    if (error) return apiInternalError(error, "loaner-cars/loans GET");

    return apiJson(
      { loans: loans ?? [] },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (e) {
    return apiInternalError(e, "loaner-cars/loans GET");
  }
}

// ─── POST: 貸出作成 ───
// 代車がテナントに属し、かつ未返却の貸出が無いことを検証 (出払い中なら 409)。
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = loanerLoanCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const {
      loaner_car_id,
      reservation_id,
      customer_id,
      body_repair_job_id,
      customer_name,
      lent_at,
      return_due_at,
      notes,
    } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) 代車が自テナントに属するか検証。
    const { data: car, error: carErr } = await admin
      .from("loaner_cars")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("id", loaner_car_id)
      .maybeSingle();
    if (carErr) return apiInternalError(carErr, "loaner-cars/loans POST car");
    if (!car) return apiValidationError("指定された代車が見つかりません。");

    // 2) 顧客 / 予約 / 鈑金案件参照のテナント検証。
    const refError = await validateTenantRefs(admin, caller.tenantId, {
      customer_id,
      reservation_id,
      body_repair_job_id,
    });
    if (refError) return apiValidationError(refError);

    // 3) すでに貸出中 (未返却) なら 409。
    const { data: active, error: activeErr } = await admin
      .from("loaner_car_loans")
      .select("id")
      .eq("tenant_id", caller.tenantId)
      .eq("loaner_car_id", loaner_car_id)
      .is("returned_at", null)
      .limit(1)
      .maybeSingle();
    if (activeErr) return apiInternalError(activeErr, "loaner-cars/loans POST active-check");
    if (active) {
      return apiError({ code: "conflict", message: "この代車は現在貸出中です。", status: 409 });
    }

    // 4) 顧客名スナップショット: 明示指定が無く customer_id があれば顧客名を補完。
    let snapshotName = customer_name;
    if (!snapshotName && customer_id) {
      const { data: cust } = await admin
        .from("customers")
        .select("name")
        .eq("tenant_id", caller.tenantId)
        .eq("id", customer_id)
        .maybeSingle();
      snapshotName = (cust?.name as string | undefined) ?? null;
    }

    const insertRow: Record<string, unknown> = {
      tenant_id: caller.tenantId,
      loaner_car_id,
      reservation_id,
      customer_id,
      body_repair_job_id,
      customer_name: snapshotName,
      return_due_at,
      notes,
    };
    // lent_at は未指定なら DB default (now()) に任せる。
    if (lent_at) insertRow.lent_at = lent_at;

    const { data: created, error } = await admin
      .from("loaner_car_loans")
      .insert(insertRow)
      .select(LOAN_COLUMNS)
      .single();
    if (error) {
      // 部分ユニーク索引 uq_loaner_active_loan (returned_at IS NULL) 違反。
      // 上の貸出中チェックと INSERT の隙間で並行リクエストが先に貸出を作った
      // 場合 (TOCTOU)。500 ではなく 409 として「貸出中」を返す。
      if ((error as { code?: string }).code === "23505") {
        return apiError({ code: "conflict", message: "この代車は現在貸出中です。", status: 409 });
      }
      return apiInternalError(error, "loaner-cars/loans POST");
    }

    return apiJson({ ok: true, loan: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "loaner-cars/loans POST");
  }
}

// ─── PATCH: 貸出更新 (返却: returned_at をセット) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = loanerLoanReturnSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, returned_at } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data: updated, error } = await admin
      .from("loaner_car_loans")
      .update({ returned_at: returned_at ?? new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(LOAN_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "loaner-cars/loans PATCH");
    if (!updated) return apiValidationError("対象の貸出記録が見つかりません。");

    return apiJson({ ok: true, loan: updated });
  } catch (e) {
    return apiInternalError(e, "loaner-cars/loans PATCH");
  }
}

/**
 * customer_id / reservation_id が指定されている場合、それが caller の
 * テナントに属するかを検証する。null の参照は検証スキップ。
 */
async function validateTenantRefs(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  refs: { customer_id: string | null; reservation_id: string | null; body_repair_job_id?: string | null },
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
  if (refs.reservation_id) {
    const { data, error } = await admin
      .from("reservations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.reservation_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された予約が見つかりません。";
  }
  if (refs.body_repair_job_id) {
    const { data, error } = await admin
      .from("body_repair_jobs")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", refs.body_repair_job_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return "指定された鈑金案件が見つかりません。";
  }
  return null;
}
