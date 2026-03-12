import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}

/** 次の請求書番号を生成: INV-YYYYMM-NNN */
async function generateInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-${ym}-`;

  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("tenant_id", tenantId)
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].invoice_number as string;
    const num = parseInt(last.replace(prefix, ""), 10);
    if (!isNaN(num)) seq = num + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ─── GET: 請求書一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";

    let query = supabase
      .from("invoices")
      .select("*")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }

    const { data: invoices, error } = await query;
    if (error) return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });

    // 顧客名を取得
    const customerIds = [...new Set((invoices ?? []).map((i) => i.customer_id).filter(Boolean))];
    let customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);
      (customers ?? []).forEach((c) => {
        customerNames[c.id] = c.name;
      });
    }

    const enriched = (invoices ?? []).map((inv) => ({
      ...inv,
      customer_name: inv.customer_id ? (customerNames[inv.customer_id] ?? null) : null,
    }));

    // 統計
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const allInvoices = enriched;
    const unpaidAmount = allInvoices
      .filter((i) => i.status === "sent" || i.status === "overdue")
      .reduce((sum, i) => sum + (i.total ?? 0), 0);
    const thisMonthIssued = allInvoices.filter(
      (i) => i.issued_at && i.issued_at >= thisMonthStart
    ).length;

    return NextResponse.json({
      invoices: enriched,
      stats: {
        total: allInvoices.length,
        unpaid_amount: unpaidAmount,
        this_month_issued: thisMonthIssued,
      },
    });
  } catch (e: any) {
    console.error("invoices list failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── POST: 請求書作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));

    const invoiceNumber = body?.invoice_number?.trim() || (await generateInvoiceNumber(supabase, caller.tenantId));
    const customerId = body?.customer_id?.trim() || null;
    const issuedAt = body?.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = body?.due_date || null;
    const note = (body?.note ?? "").trim() || null;
    const items = body?.items ?? [];
    const status = body?.status || "draft";

    // 金額計算
    let subtotal = 0;
    const itemsJson = items.map((item: any) => {
      const qty = parseInt(String(item.quantity || 0), 10);
      const unitPrice = parseInt(String(item.unit_price || 0), 10);
      const amount = qty * unitPrice;
      subtotal += amount;
      return {
        description: (item.description ?? "").trim(),
        quantity: qty,
        unit_price: unitPrice,
        amount,
      };
    });

    const tax = Math.floor(subtotal * 0.1);
    const total = subtotal + tax;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: customerId,
      invoice_number: invoiceNumber,
      issued_at: issuedAt,
      due_date: dueDate,
      status,
      subtotal,
      tax,
      total,
      note,
      items_json: itemsJson,
    };

    const { data, error } = await supabase.from("invoices").insert(row).select().single();
    if (error) return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (e: any) {
    console.error("invoice create failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── PUT: 請求書更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // ステータス更新
    if (body.status !== undefined) updates.status = body.status;
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null;
    if (body.issued_at !== undefined) updates.issued_at = body.issued_at;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.note !== undefined) updates.note = (body.note ?? "").trim() || null;
    if (body.invoice_number !== undefined) updates.invoice_number = body.invoice_number;

    // 明細更新
    if (body.items !== undefined) {
      const items = body.items ?? [];
      let subtotal = 0;
      const itemsJson = items.map((item: any) => {
        const qty = parseInt(String(item.quantity || 0), 10);
        const unitPrice = parseInt(String(item.unit_price || 0), 10);
        const amount = qty * unitPrice;
        subtotal += amount;
        return {
          description: (item.description ?? "").trim(),
          quantity: qty,
          unit_price: unitPrice,
          amount,
        };
      });
      const tax = Math.floor(subtotal * 0.1);
      updates.items_json = itemsJson;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = subtotal + tax;
    }

    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "update_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, invoice: data });
  } catch (e: any) {
    console.error("invoice update failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── DELETE: 請求書削除（下書きのみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    // 下書きか確認
    const { data: inv } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!inv) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (inv.status !== "draft") {
      return NextResponse.json({
        error: "not_draft",
        message: "下書きステータスの請求書のみ削除できます。",
      }, { status: 400 });
    }

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("invoice delete failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
