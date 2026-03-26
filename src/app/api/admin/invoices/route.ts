import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";

/** 次の請求書番号を生成: INV-YYYYMM-NNN */
async function generateInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `INV-${ym}-`;

  const { data } = await supabase
    .from("documents")
    .select("doc_number")
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .like("doc_number", `${prefix}%`)
    .order("doc_number", { ascending: false })
    .limit(1);

  let seq = 1;
  if (data && data.length > 0) {
    const last = data[0].doc_number as string;
    const num = parseInt(last.replace(prefix, ""), 10);
    if (!isNaN(num)) seq = num + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ─── GET: 請求書一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    // 証明書取得アクション
    if (action === "certificates" && customerId) {
      const { data: certs } = await supabase
        .from("certificates")
        .select("id, public_id, customer_name, service_price, status, created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      return NextResponse.json({ certificates: certs ?? [] });
    }

    const selectCols = "id, tenant_id, customer_id, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, note, payment_date, created_at, updated_at";

    let query = supabase
      .from("documents")
      .select(selectCols)
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice")
      .order("created_at", { ascending: false });

    let countQuery = supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice");

    if (status && status !== "all") {
      query = query.eq("status", status);
      countQuery = countQuery.eq("status", status);
    }
    if (customerId) {
      query = query.eq("customer_id", customerId);
      countQuery = countQuery.eq("customer_id", customerId);
    }

    if (page > 0) {
      query = query.range(from, to);
    }

    const [{ data: docs, error }, { count: totalCount }] = await Promise.all([query, countQuery]);
    if (error) {
      console.error("[invoices] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    // 顧客名を取得
    const customerIds = [...new Set((docs ?? []).map((i) => i.customer_id).filter(Boolean))];
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

    const enriched = (docs ?? []).map((inv) => ({
      ...inv,
      // 後方互換: invoice_number エイリアス
      invoice_number: inv.doc_number,
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
        total: totalCount ?? allInvoices.length,
        unpaid_amount: unpaidAmount,
        this_month_issued: thisMonthIssued,
      },
      ...(page > 0 && {
        pagination: {
          page,
          per_page: perPage,
          total: totalCount ?? allInvoices.length,
          total_pages: Math.ceil((totalCount ?? allInvoices.length) / perPage),
        },
      }),
    });
  } catch (e: any) {
    console.error("invoices list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── POST: 請求書作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));

    const docNumber = body?.invoice_number?.trim() || (await generateInvoiceNumber(supabase, caller.tenantId));
    const customerId = body?.customer_id?.trim() || null;
    const issuedAt = body?.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = body?.due_date || null;
    const note = (body?.note ?? "").trim() || null;
    const items = body?.items ?? [];
    const status = body?.status || "draft";
    const isInvoiceCompliant = !!body?.is_invoice_compliant;
    const showSeal = !!body?.show_seal;
    const showLogo = body?.show_logo !== false;
    const showBankInfo = !!body?.show_bank_info;
    const recipientName = (body?.recipient_name ?? "").trim() || null;
    const taxRate = parseInt(String(body?.tax_rate ?? 10), 10);
    const vehicleId = (body?.vehicle_id ?? "").trim() || null;
    const vehicleInfo = body?.vehicle_info ?? null;

    // 金額計算
    let subtotal = 0;
    const itemsJson = items.map((item: any) => {
      const qty = parseInt(String(item.quantity || 0), 10);
      const unitPrice = parseInt(String(item.unit_price || 0), 10);
      const amount = qty * unitPrice;
      subtotal += amount;
      const mapped: Record<string, unknown> = {
        description: (item.description ?? "").trim(),
        quantity: qty,
        unit: (item.unit ?? "式").trim(),
        unit_price: unitPrice,
        amount,
      };
      if (item.certificate_id) mapped.certificate_id = item.certificate_id;
      if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
      return mapped;
    });

    const tax = Math.floor(subtotal * (taxRate / 100));
    const total = subtotal + tax;

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: customerId,
      doc_type: "invoice" as const,
      doc_number: docNumber,
      issued_at: issuedAt,
      due_date: dueDate,
      status,
      subtotal,
      tax,
      total,
      note,
      items_json: itemsJson,
      meta_json: {},
      is_invoice_compliant: isInvoiceCompliant,
      show_seal: showSeal,
      show_logo: showLogo,
      show_bank_info: showBankInfo,
      recipient_name: recipientName,
      tax_rate: taxRate,
      vehicle_id: vehicleId,
      vehicle_info_json: vehicleInfo ?? {},
    };

    const { data, error } = await supabase.from("documents").insert(row).select().single();
    if (error) {
      console.error("[invoices] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    // 後方互換: invoice_number エイリアス
    return NextResponse.json({ ok: true, invoice: { ...data, invoice_number: data.doc_number } });
  } catch (e: any) {
    console.error("invoice create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── PUT: 請求書更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
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
    if (body.invoice_number !== undefined) updates.doc_number = body.invoice_number;
    if (body.is_invoice_compliant !== undefined) updates.is_invoice_compliant = !!body.is_invoice_compliant;
    if (body.show_seal !== undefined) updates.show_seal = !!body.show_seal;
    if (body.show_logo !== undefined) updates.show_logo = !!body.show_logo;
    if (body.show_bank_info !== undefined) updates.show_bank_info = !!body.show_bank_info;
    if (body.recipient_name !== undefined) updates.recipient_name = (body.recipient_name ?? "").trim() || null;
    if (body.payment_date !== undefined) updates.payment_date = body.payment_date || null;

    // 明細更新
    if (body.items !== undefined) {
      const items = body.items ?? [];
      let subtotal = 0;
      const itemsJson = items.map((item: any) => {
        const qty = parseInt(String(item.quantity || 0), 10);
        const unitPrice = parseInt(String(item.unit_price || 0), 10);
        const amount = qty * unitPrice;
        subtotal += amount;
        const mapped: Record<string, unknown> = {
          description: (item.description ?? "").trim(),
          quantity: qty,
          unit: (item.unit ?? "式").trim(),
          unit_price: unitPrice,
          amount,
        };
        if (item.certificate_id) mapped.certificate_id = item.certificate_id;
        if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
        return mapped;
      });
      const taxRate = parseInt(String(body.tax_rate ?? 10), 10);
      const tax = Math.floor(subtotal * (taxRate / 100));
      updates.items_json = itemsJson;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = subtotal + tax;
      updates.tax_rate = taxRate;
    }

    const { data, error } = await supabase
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice")
      .select()
      .single();

    if (error) {
      console.error("[invoices] update_failed:", error.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, invoice: { ...data, invoice_number: data.doc_number } });
  } catch (e: any) {
    console.error("invoice update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── DELETE: 請求書削除（下書きのみ、admin以上） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const callerWithRole = await resolveCallerWithRole(supabase);
    if (!callerWithRole) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!requireMinRole(callerWithRole, "admin")) {
      return NextResponse.json({ error: "forbidden", message: "削除権限がありません。" }, { status: 403 });
    }
    const caller = { userId: callerWithRole.userId, tenantId: callerWithRole.tenantId };

    const body = await req.json().catch(() => ({} as any));
    const id = (body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

    // 下書きか確認
    const { data: inv } = await supabase
      .from("documents")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice")
      .single();

    if (!inv) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (inv.status !== "draft") {
      return NextResponse.json({
        error: "not_draft",
        message: "下書きステータスの請求書のみ削除できます。",
      }, { status: 400 });
    }

    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (error) {
      console.error("[invoices] delete_failed:", error.message);
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("invoice delete failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
