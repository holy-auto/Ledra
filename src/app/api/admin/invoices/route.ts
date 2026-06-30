import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { invoiceCreateSchema, invoiceUpdateSchema, invoiceDeleteSchema } from "@/lib/validations/invoice";
import { buildTaxBreakdown, totalTax, isValidRegistrationNumber } from "@/lib/invoice/taxBreakdown";
import { recordInvoicePaymentBalance } from "@/lib/invoice/recordPayment";

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
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const docNumber = url.searchParams.get("doc_number") ?? "";
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    // 請求書番号による単票取得（POS 会計用）
    if (docNumber) {
      const { data: inv } = await supabase
        .from("documents")
        .select(
          "id, doc_number, recipient_name, customer_id, vehicle_id, total, subtotal, tax, tax_rate, status, issued_at, due_date, items_json",
        )
        .eq("tenant_id", caller.tenantId)
        .eq("doc_type", "invoice")
        .eq("doc_number", docNumber.trim())
        .maybeSingle();

      if (!inv) return apiJson({ found: false });
      return apiJson({ found: true, invoice: inv });
    }

    // 証明書取得アクション
    if (action === "certificates" && customerId) {
      const { data: certs } = await supabase
        .from("certificates")
        .select("id, public_id, customer_name, service_price, status, created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });

      return apiJson({ certificates: certs ?? [] });
    }

    const selectCols =
      "id, tenant_id, customer_id, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, note, payment_date, created_at, updated_at";

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
      return apiInternalError(error, "invoices list");
    }

    // 顧客名を取得
    const customerIds = [...new Set((docs ?? []).map((i) => i.customer_id).filter(Boolean))];
    const customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
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
    const thisMonthIssued = allInvoices.filter((i) => i.issued_at && i.issued_at >= thisMonthStart).length;

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
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
      },
      { headers },
    );
  } catch (e: unknown) {
    return apiInternalError(e, "invoices list");
  }
}

// ─── POST: 請求書作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = invoiceCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

    const docNumber = input.invoice_number || (await generateInvoiceNumber(supabase, caller.tenantId));
    const customerId = input.customer_id || null;
    const issuedAt = input.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = input.due_date || null;
    const note = input.note;
    const items = input.items ?? [];
    const status = input.status;
    const showSeal = !!input.show_seal;
    const showLogo = input.show_logo !== false;
    const showBankInfo = !!input.show_bank_info;
    const recipientName = input.recipient_name;
    const taxRate = input.tax_rate ?? 10;
    const vehicleId = input.vehicle_id || null;
    const vehicleInfo = input.vehicle_info ?? null;

    // 金額計算 — 行ごとに tax_rate / is_reduced_rate を保持し、
    //   税率ごとに小計・税額を区分 (適格請求書要件)。
    let subtotal = 0;
    const itemsJson = items.map((item: any) => {
      const qty = parseInt(String(item.quantity || 0), 10);
      const unitPrice = parseInt(String(item.unit_price || 0), 10);
      const amount = qty * unitPrice;
      subtotal += amount;
      const lineRate = typeof item.tax_rate === "number" ? item.tax_rate : item.is_reduced_rate ? 8 : null;
      const mapped: Record<string, unknown> = {
        description: (item.description ?? "").trim(),
        quantity: qty,
        unit: (item.unit ?? "式").trim(),
        unit_price: unitPrice,
        amount,
      };
      if (lineRate !== null) mapped.tax_rate = lineRate;
      if (item.is_reduced_rate || lineRate === 8) mapped.is_reduced_rate = true;
      if (item.certificate_id) mapped.certificate_id = item.certificate_id;
      if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
      return mapped;
    });

    const taxBreakdown = buildTaxBreakdown(
      itemsJson.map((it) => ({
        amount: it.amount as number,
        tax_rate: typeof it.tax_rate === "number" ? (it.tax_rate as number) : null,
        is_reduced_rate: !!it.is_reduced_rate,
      })),
      taxRate,
    );
    const tax = totalTax(taxBreakdown);
    const total = subtotal + tax;

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 適格請求書フラグは「明示 ON」かつ「テナントの登録番号が T+13桁」のときのみ ON。
    // フォーマット不正 / 未設定なら強制 OFF にして、PDF 上で「インボイス対応」表記が
    // 出ないようにする (受領側で仕入税額控除に使われる誤解を防ぐ)。
    const tenantInfo = await admin
      .from("tenants")
      .select("registration_number")
      .eq("id", caller.tenantId)
      .maybeSingle();
    const tenantRegNumberValid = isValidRegistrationNumber(tenantInfo.data?.registration_number ?? null);
    const isInvoiceCompliant = !!input.is_invoice_compliant && tenantRegNumberValid;

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
      tax_breakdown: taxBreakdown,
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

    const { data, error } = await admin
      .from("documents")
      .insert(row)
      .select(
        "id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, tax_breakdown, note, items_json, is_invoice_compliant, show_seal, show_logo, show_bank_info, recipient_name, vehicle_id, vehicle_info_json, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "invoices insert");
    }

    // 後方互換: invoice_number エイリアス
    return apiJson({ ok: true, invoice: { ...data, invoice_number: data.doc_number } });
  } catch (e: unknown) {
    return apiInternalError(e, "invoices create");
  }
}

// ─── PUT: 請求書更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = invoiceUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "missing_id");
    }
    const body = parsed.data;
    const id = body.id;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // ステータス更新
    if (body.status !== undefined) updates.status = body.status;
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null;
    if (body.issued_at !== undefined) updates.issued_at = body.issued_at;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.note !== undefined) updates.note = body.note;
    if (body.invoice_number !== undefined) updates.doc_number = body.invoice_number;
    if (body.is_invoice_compliant !== undefined) {
      // 登録番号フォーマット未通過なら、明示 ON でも強制 OFF にする (PDF 表示と整合)
      if (body.is_invoice_compliant) {
        const { admin } = createTenantScopedAdmin(caller.tenantId);
        const tenantInfo = await admin
          .from("tenants")
          .select("registration_number")
          .eq("id", caller.tenantId)
          .maybeSingle();
        updates.is_invoice_compliant = isValidRegistrationNumber(tenantInfo.data?.registration_number ?? null);
      } else {
        updates.is_invoice_compliant = false;
      }
    }
    if (body.show_seal !== undefined) updates.show_seal = !!body.show_seal;
    if (body.show_logo !== undefined) updates.show_logo = !!body.show_logo;
    if (body.show_bank_info !== undefined) updates.show_bank_info = !!body.show_bank_info;
    if (body.recipient_name !== undefined) updates.recipient_name = body.recipient_name;
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
        const lineRate = typeof item.tax_rate === "number" ? item.tax_rate : item.is_reduced_rate ? 8 : null;
        const mapped: Record<string, unknown> = {
          description: (item.description ?? "").trim(),
          quantity: qty,
          unit: (item.unit ?? "式").trim(),
          unit_price: unitPrice,
          amount,
        };
        if (lineRate !== null) mapped.tax_rate = lineRate;
        if (item.is_reduced_rate || lineRate === 8) mapped.is_reduced_rate = true;
        if (item.certificate_id) mapped.certificate_id = item.certificate_id;
        if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
        return mapped;
      });
      const taxRate = body.tax_rate ?? 10;
      const taxBreakdown = buildTaxBreakdown(
        itemsJson.map((it) => ({
          amount: it.amount as number,
          tax_rate: typeof it.tax_rate === "number" ? (it.tax_rate as number) : null,
          is_reduced_rate: !!it.is_reduced_rate,
        })),
        taxRate,
      );
      const tax = totalTax(taxBreakdown);
      updates.items_json = itemsJson;
      updates.tax_breakdown = taxBreakdown;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = subtotal + tax;
      updates.tax_rate = taxRate;
    }

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id と doc_type で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice")
      .select(
        "id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, tax_breakdown, note, items_json, is_invoice_compliant, show_seal, show_logo, show_bank_info, recipient_name, payment_date, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "invoices update");
    }

    // 「入金済」に更新したら売掛元帳 (payment_entries) にも残高分を記帳して消込を
    // 整合させる (status=paid だけだと元帳上は未消込のまま残るため)。Stripe 自動入金と
    // 同じ recordInvoicePaymentBalance を使い、残高 0 のときは二重計上しない。
    // 記帳失敗は status 更新 (主) を巻き戻さず log のみ (best-effort)。
    if (body.status === "paid" && data) {
      try {
        await recordInvoicePaymentBalance(admin, {
          tenantId: caller.tenantId,
          documentId: data.id,
          total: Number(data.total ?? 0),
          customerId: (data.customer_id as string | null) ?? null,
          paymentMethod: "cash",
          paymentDate: (data.payment_date as string | null) ?? new Date().toISOString().slice(0, 10),
          recordedBy: caller.userId,
          notes: "請求書を入金済に更新 (自動記帳)",
        });
      } catch (ledgerErr) {
        console.error("invoices PUT: ledger entry failed (non-blocking)", ledgerErr);
      }
    }

    return apiJson({ ok: true, invoice: { ...data, invoice_number: data.doc_number } });
  } catch (e: unknown) {
    return apiInternalError(e, "invoices update");
  }
}

// ─── DELETE: 請求書削除（下書きのみ、admin以上） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const callerWithRole = await resolveCallerWithRole(supabase);
    if (!callerWithRole) return apiUnauthorized();
    if (!requireMinRole(callerWithRole, "admin")) {
      return apiForbidden("削除権限がありません。");
    }
    const caller = { userId: callerWithRole.userId, tenantId: callerWithRole.tenantId };

    const parsed = invoiceDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "missing_id");
    }
    const id = parsed.data.id;

    // 下書きか確認
    const { data: inv } = await supabase
      .from("documents")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .eq("doc_type", "invoice")
      .single();

    if (!inv) return apiNotFound("not_found");

    if (inv.status !== "draft") {
      return apiValidationError("下書きステータスの請求書のみ削除できます。");
    }

    // RLS をバイパスしてサービスロールで DELETE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("documents").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "invoices delete");
    }

    return apiJson({ ok: true });
  } catch (e: unknown) {
    return apiInternalError(e, "invoices delete");
  }
}
