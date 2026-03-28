import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";

// ─── GET: 支払一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!requirePermission(caller, "payments:view")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
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
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("paid_at", { ascending: false });

    let countQuery = supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
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
      console.error("[payments] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // 顧客名を取得
    const customerIds = [...new Set((payments ?? []).map((p) => p.customer_id).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
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
    const totalAmount = enriched
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + (p.amount ?? 0), 0);

    return NextResponse.json({
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
    });
  } catch (e: unknown) {
    console.error("payments list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: 支払作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!requirePermission(caller, "payments:create")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const paymentMethod = (String(body?.payment_method ?? "")).trim();
    if (!paymentMethod) return NextResponse.json({ error: "missing_payment_method" }, { status: 400 });

    const validMethods = ["cash", "card", "qr", "bank_transfer", "other"];
    if (!validMethods.includes(paymentMethod)) {
      return NextResponse.json({ error: "invalid_payment_method" }, { status: 400 });
    }

    const amount = parseInt(String(body?.amount ?? ""), 10);
    if (isNaN(amount) || amount < 1 || amount > 999_999_999) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }

    const receivedAmount = body?.received_amount != null
      ? parseInt(String(body.received_amount), 10)
      : null;
    if (receivedAmount != null && (isNaN(receivedAmount) || receivedAmount < 0)) {
      return NextResponse.json({ error: "invalid_received_amount" }, { status: 400 });
    }
    const changeAmount = receivedAmount != null && receivedAmount > amount
      ? receivedAmount - amount
      : 0;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      store_id: (String(body?.store_id ?? "")).trim() || null,
      document_id: (String(body?.document_id ?? "")).trim() || null,
      reservation_id: (String(body?.reservation_id ?? "")).trim() || null,
      customer_id: (String(body?.customer_id ?? "")).trim() || null,
      register_session_id: (String(body?.register_session_id ?? "")).trim() || null,
      payment_method: paymentMethod,
      amount,
      received_amount: receivedAmount,
      change_amount: changeAmount,
      status: "completed",
      refund_amount: 0,
      note: (String(body?.note ?? "")).trim() || null,
      paid_at: body?.paid_at || new Date().toISOString(),
      created_by: caller.userId,
    };

    const { data, error } = await supabase.from("payments").insert(row).select().single();
    if (error) {
      console.error("[payments] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payment: data });
  } catch (e: unknown) {
    console.error("payment create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: 支払更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!requirePermission(caller, "payments:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.store_id !== undefined) updates.store_id = (String(body.store_id ?? "")).trim() || null;
    if (body.document_id !== undefined) updates.document_id = (String(body.document_id ?? "")).trim() || null;
    if (body.reservation_id !== undefined) updates.reservation_id = (String(body.reservation_id ?? "")).trim() || null;
    if (body.customer_id !== undefined) updates.customer_id = (String(body.customer_id ?? "")).trim() || null;
    if (body.payment_method !== undefined) updates.payment_method = body.payment_method;
    if (body.amount !== undefined) updates.amount = parseInt(String(body.amount), 10);
    if (body.received_amount !== undefined) updates.received_amount = body.received_amount != null ? parseInt(String(body.received_amount), 10) : null;
    if (body.change_amount !== undefined) updates.change_amount = parseInt(String(body.change_amount ?? 0), 10);
    if (body.note !== undefined) updates.note = (String(body.note ?? "")).trim() || null;
    if (body.paid_at !== undefined) updates.paid_at = body.paid_at;

    // ステータス変更（返金処理）
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "refunded" || body.status === "partial_refund") {
        if (body.refund_amount !== undefined) {
          updates.refund_amount = parseInt(String(body.refund_amount), 10) || 0;
        }
        if (body.refund_reason !== undefined) {
          updates.refund_reason = (String(body.refund_reason ?? "")).trim() || null;
        }
      }
      if (body.status === "voided") {
        updates.refund_reason = (String(body.refund_reason ?? "")).trim() || null;
      }
    }

    const { data, error } = await supabase
      .from("payments")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) {
      console.error("[payments] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, payment: data });
  } catch (e: unknown) {
    console.error("payment update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: 支払削除（admin以上のみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    if (!requirePermission(caller, "payments:manage")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (String(body?.id ?? "")).trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[payments] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("payment delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
