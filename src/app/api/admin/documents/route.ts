import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { DOC_TYPES, type DocType } from "@/types/document";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** 書類番号自動採番: {PREFIX}-YYYYMM-NNN */
async function generateDocNumber(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  docType: DocType,
): Promise<string> {
  const meta = DOC_TYPES[docType];
  if (!meta) throw new Error(`Unknown doc_type: ${docType}`);

  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = `${meta.prefix}-${ym}-`;

  const { data } = await supabase
    .from("documents")
    .select("doc_number")
    .eq("tenant_id", tenantId)
    .eq("doc_type", docType)
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

function calcItems(items: any[], taxRate: number) {
  let subtotal = 0;
  const itemsJson = items.map((item: any) => {
    const qty = parseInt(String(item.quantity || 0), 10);
    const unitPrice = parseInt(String(item.unit_price || 0), 10);
    const amount = qty * unitPrice;
    subtotal += amount;
    const mapped: Record<string, unknown> = {
      description: (item.description ?? "").trim(),
      quantity: qty,
      unit_price: unitPrice,
      amount,
    };
    if (item.tax_category != null) mapped.tax_category = item.tax_category;
    if (item.certificate_id) mapped.certificate_id = item.certificate_id;
    if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
    return mapped;
  });

  const tax = Math.floor(subtotal * (taxRate / 100));
  return { itemsJson, subtotal, tax, total: subtotal + tax };
}

// ─── GET: 帳票一覧 ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const docType = url.searchParams.get("doc_type") ?? "";
    const status = url.searchParams.get("status") ?? "";
    const customerId = url.searchParams.get("customer_id") ?? "";
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    const selectCols =
      "id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, note, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, created_at, updated_at";

    let query = supabase
      .from("documents")
      .select(selectCols)
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    let countQuery = supabase
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId);

    if (docType) {
      query = query.eq("doc_type", docType);
      countQuery = countQuery.eq("doc_type", docType);
    }
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
      return apiInternalError(error, "documents GET");
    }

    // 顧客名を並列取得（メインクエリ完了後すぐにIDを収集）
    const customerIds = [...new Set((docs ?? []).map((d) => d.customer_id).filter(Boolean))];
    const customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase.from("customers").select("id, name").in("id", customerIds);
      for (const c of customers ?? []) {
        customerNames[c.id] = c.name;
      }
    }

    const enriched = (docs ?? []).map((d) => ({
      ...d,
      customer_name: d.customer_id ? (customerNames[d.customer_id] ?? null) : null,
    }));

    // 統計
    const total = enriched.length;
    const unpaidAmount = enriched
      .filter((d) => d.status === "sent" || d.status === "accepted")
      .reduce((sum, d) => sum + (d.total ?? 0), 0);

    return apiJson({
      documents: enriched,
      stats: { total: totalCount ?? total, unpaid_amount: unpaidAmount },
      ...(page > 0 && {
        pagination: {
          page,
          per_page: perPage,
          total: totalCount ?? total,
          total_pages: Math.ceil((totalCount ?? total) / perPage),
        },
      }),
    });
  } catch (e) {
    return apiInternalError(e, "documents GET");
  }
}

// ─── POST: 帳票作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const docType = (body?.doc_type ?? "").trim() as DocType;
    if (!DOC_TYPES[docType]) {
      return apiValidationError("invalid doc_type");
    }

    const docNumber = body?.doc_number?.trim() || (await generateDocNumber(supabase, caller.tenantId, docType));
    const customerId = body?.customer_id?.trim() || null;
    const issuedAt = body?.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = body?.due_date || null;
    const note = (body?.note ?? "").trim() || null;
    const items = body?.items ?? [];
    const taxRate = parseInt(String(body?.tax_rate ?? 10), 10);
    const status = body?.status || "draft";
    const isInvoiceCompliant = !!body?.is_invoice_compliant;
    const sourceDocumentId = body?.source_document_id || null;
    const showSeal = !!body?.show_seal;
    const showLogo = body?.show_logo !== false;
    const showBankInfo = !!body?.show_bank_info;
    const recipientName = (body?.recipient_name ?? "").trim() || null;
    const recipientHonorific = body?.recipient_honorific ?? "御中";
    const recipientPostalCode = (body?.recipient_postal_code ?? "").trim() || null;
    const recipientAddress = (body?.recipient_address ?? "").trim() || null;
    const recipientPhone = (body?.recipient_phone ?? "").trim() || null;
    const subject = (body?.subject ?? "").trim() || null;
    const periodStart = body?.period_start || null;
    const periodEnd = body?.period_end || null;
    const paymentTerms = (body?.payment_terms ?? "").trim() || null;
    const deliveryDate = body?.delivery_date || null;
    const templateId = body?.template_id || null;
    const metaJson = body?.meta_json ?? {};

    const { itemsJson, subtotal, tax, total } = calcItems(items, taxRate);

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: customerId,
      recipient_name: recipientName,
      recipient_honorific: recipientHonorific,
      recipient_postal_code: recipientPostalCode,
      recipient_address: recipientAddress,
      recipient_phone: recipientPhone,
      subject,
      period_start: periodStart,
      period_end: periodEnd,
      payment_terms: paymentTerms,
      delivery_date: deliveryDate,
      template_id: templateId,
      doc_type: docType,
      doc_number: docNumber,
      issued_at: issuedAt,
      due_date: dueDate,
      status,
      subtotal,
      tax,
      total,
      tax_rate: taxRate,
      items_json: itemsJson,
      note,
      meta_json: metaJson,
      is_invoice_compliant: isInvoiceCompliant,
      source_document_id: sourceDocumentId,
      show_seal: showSeal,
      show_logo: showLogo,
      show_bank_info: showBankInfo,
    };

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("documents")
      .insert(row)
      .select(
        "id, tenant_id, customer_id, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, items_json, note, meta_json, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, created_at, updated_at",
      )
      .single();
    if (error) {
      return apiInternalError(error, "documents POST");
    }

    return apiJson({ ok: true, document: data });
  } catch (e) {
    return apiInternalError(e, "documents POST");
  }
}

// ─── PUT: 帳票更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updates.status = body.status;
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null;
    if (body.issued_at !== undefined) updates.issued_at = body.issued_at;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.note !== undefined) updates.note = (body.note ?? "").trim() || null;
    if (body.doc_number !== undefined) updates.doc_number = body.doc_number;
    if (body.is_invoice_compliant !== undefined) updates.is_invoice_compliant = !!body.is_invoice_compliant;
    if (body.show_seal !== undefined) updates.show_seal = !!body.show_seal;
    if (body.show_logo !== undefined) updates.show_logo = !!body.show_logo;
    if (body.show_bank_info !== undefined) updates.show_bank_info = !!body.show_bank_info;
    if (body.recipient_name !== undefined) updates.recipient_name = (body.recipient_name ?? "").trim() || null;
    if (body.recipient_honorific !== undefined) updates.recipient_honorific = body.recipient_honorific;
    if (body.recipient_postal_code !== undefined)
      updates.recipient_postal_code = (body.recipient_postal_code ?? "").trim() || null;
    if (body.recipient_address !== undefined) updates.recipient_address = (body.recipient_address ?? "").trim() || null;
    if (body.recipient_phone !== undefined) updates.recipient_phone = (body.recipient_phone ?? "").trim() || null;
    if (body.subject !== undefined) updates.subject = (body.subject ?? "").trim() || null;
    if (body.period_start !== undefined) updates.period_start = body.period_start || null;
    if (body.period_end !== undefined) updates.period_end = body.period_end || null;
    if (body.payment_terms !== undefined) updates.payment_terms = (body.payment_terms ?? "").trim() || null;
    if (body.delivery_date !== undefined) updates.delivery_date = body.delivery_date || null;
    if (body.template_id !== undefined) updates.template_id = body.template_id || null;
    if (body.meta_json !== undefined) updates.meta_json = body.meta_json;

    if (body.items !== undefined) {
      const taxRate = parseInt(String(body.tax_rate ?? 10), 10);
      const { itemsJson, subtotal, tax, total } = calcItems(body.items ?? [], taxRate);
      updates.items_json = itemsJson;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = total;
      updates.tax_rate = taxRate;
    }

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, customer_id, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, items_json, note, meta_json, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "documents PUT");
    }

    return apiJson({ ok: true, document: data });
  } catch (e) {
    return apiInternalError(e, "documents PUT");
  }
}

// ─── DELETE: 帳票削除（下書きのみ） ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const id = (body?.id ?? "").trim();
    if (!id) return apiValidationError("id is required");

    const { data: doc } = await supabase
      .from("documents")
      .select("status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (!doc) return apiNotFound("帳票が見つかりません。");

    if (doc.status !== "draft") {
      return apiValidationError("下書きステータスの帳票のみ削除できます。");
    }

    // RLS をバイパスしてサービスロールで DELETE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("documents").delete().eq("id", id).eq("tenant_id", caller.tenantId);

    if (error) {
      return apiInternalError(error, "documents DELETE");
    }

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "documents DELETE");
  }
}
