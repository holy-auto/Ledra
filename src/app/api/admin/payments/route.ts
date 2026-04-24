import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { paymentCreateSchema, paymentDeleteSchema, paymentUpdateSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

// ─── GET: 支払一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requirePermission(caller, "payments:view")) {
      return apiForbidden();
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const paymentMethod = url.searchParams.get("payment_method") ?? "";
    const storeId = url.searchParams.get("store_id") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    const { page, perPage, from: rangeFrom, to: rangeTo } = parsePagination(req, { maxPerPage: 200 });

    let query = supabase
      .from("payments")
      .select(
        "id, tenant_id, store_id, document_id, reservation_id, customer_id, register_session_id, payment_method, amount, received_amount, change_amount, status, refund_amount, refund_reason, note, paid_at, created_by, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("paid_at", { ascending: false });

    let countQuery = supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (status && status !== "all") {
      query = query.eq("status", status);
      countQuery = countQuery.eq("status", status);
    }
    if (paymentMethod) {
      query = query.eq("payment_method", paymentMethod);
      countQuery = countQuery.eq("payment_method", paymentMethod);
    }
    if (storeId) {
      query = query.eq("store_id", storeId);
      countQuery = countQuery.eq("store_id", storeId);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
      countQuery = countQuery.eq("customer_id", customerId);
    }
    if (from) {
      query = query.gte("paid_at", from);
      countQuery = countQuery.gte("paid_at", from);
    }
    if (to) {
      query = query.lte("paid_at", to);
      countQuery = countQuery.lte("paid_at", to);
    }

    if (page > 0) {
      query = query.range(rangeFrom, rangeTo);
    }

    const [{ data: payments, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      return apiInternalError(error, "payments list");
    }

    // 顧客名を取得
    const customerIds = [...new Set((payments ?? []).map((p) => p.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerMap[c.id] = c.name;
      });
    }

    const enriched = (payments ?? []).map((p) => ({
      ...p,
      customer_name: p.customer_id ? (customerMap[p.customer_id] ?? null) : null,
    }));

    // 統計
    const total = enriched.length;
    const totalAmount = enriched.filter((p) => p.status === "completed").reduce((sum, p) => sum + (p.amount ?? 0), 0);

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        payments: enriched,
        stats: {
          total: totalCount ?? total,
          total_amount: totalAmount,
        },
        ...(page > 0 && {
          pagination: {
            page,
            per_page: perPage,
            total: totalCount ?? total,
            total_pages: Math.ceil((totalCount ?? total) / perPage),
          },
        }),
      },
      { headers },
    );
  } catch (e: unknown) {
    return apiInternalError(e, "payments list");
  }
}

// ─── POST: 支払作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requirePermission(caller, "payments:create")) {
      return apiForbidden();
    }

    const parsed = paymentCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;
    const changeAmount =
      input.received_amount != null && input.received_amount > input.amount ? input.received_amount - input.amount : 0;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      store_id: input.store_id,
      document_id: input.document_id,
      reservation_id: input.reservation_id,
      customer_id: input.customer_id,
      register_session_id: input.register_session_id,
      payment_method: input.payment_method,
      amount: input.amount,
      received_amount: input.received_amount ?? null,
      change_amount: changeAmount,
      status: "completed",
      refund_amount: 0,
      note: input.note,
      paid_at: input.paid_at || new Date().toISOString(),
      created_by: caller.userId,
    };

    const { data, error } = await supabase
      .from("payments")
      .insert(row)
      .select(
        "id, tenant_id, store_id, document_id, reservation_id, customer_id, register_session_id, payment_method, amount, received_amount, change_amount, status, refund_amount, note, paid_at, created_by, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "payments insert");
    }

    return apiJson({ ok: true, payment: data });
  } catch (e: unknown) {
    return apiInternalError(e, "payments create");
  }
}

// ─── PUT: 支払更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requirePermission(caller, "payments:manage")) {
      return apiForbidden();
    }

    const parsed = paymentUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }

    const { data, error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, store_id, document_id, reservation_id, customer_id, register_session_id, payment_method, amount, received_amount, change_amount, status, refund_amount, refund_reason, note, paid_at, created_by, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "payments update");
    }

    return apiJson({ ok: true, payment: data });
  } catch (e: unknown) {
    return apiInternalError(e, "payments update");
  }
}

// ─── DELETE: 支払削除（admin以上のみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    if (!requirePermission(caller, "payments:manage")) {
      return apiForbidden();
    }

    const parsed = paymentDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id } = parsed.data;

    const { error } = await supabase.from("payments").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "payments delete");
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "payments delete");
  }
}
