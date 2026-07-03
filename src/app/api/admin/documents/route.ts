import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { DOC_TYPES, isDocumentEditable, type DocType } from "@/types/document";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parsePagination } from "@/lib/api/pagination";
import { apiJson, apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { documentCreateSchema, documentUpdateSchema, documentDeleteSchema } from "@/lib/validations/document";
import { resolveBaseUrl } from "@/lib/url";
import { maybeAutoSendDocumentOnConfirm } from "@/lib/ai/automation/documentAuto";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";

export const dynamic = "force-dynamic";

function calcItems(items: any[], taxRate: number, isTaxInclusive = false) {
  let itemsSum = 0; // 通常行 amount の合計（税込モードでは税込合計、税抜モードでは税抜合計）
  let runningSubtotal = 0; // 直前の小計行からの累積（小計行の金額自動算出に使用）
  const itemsJson = items.map((item: any) => {
    const itemType = item.item_type === "heading" || item.item_type === "subtotal" ? item.item_type : "item";

    if (itemType === "heading") {
      return {
        item_type: "heading",
        description: (item.description ?? "").trim(),
        quantity: 0,
        unit: (item.unit ?? "").trim() || null,
        unit_price: 0,
        amount: 0,
      } as Record<string, unknown>;
    }

    if (itemType === "subtotal") {
      const subtotalAmount = runningSubtotal;
      runningSubtotal = 0;
      return {
        item_type: "subtotal",
        description: (item.description ?? "").trim() || "小計",
        quantity: 0,
        unit: null,
        unit_price: 0,
        amount: subtotalAmount,
      } as Record<string, unknown>;
    }

    const qty = parseInt(String(item.quantity || 0), 10);
    const unitPrice = parseInt(String(item.unit_price || 0), 10);
    const amount = qty * unitPrice;
    itemsSum += amount;
    runningSubtotal += amount;
    const mapped: Record<string, unknown> = {
      item_type: "item",
      description: (item.description ?? "").trim(),
      quantity: qty,
      unit: (item.unit ?? "").trim() || null,
      unit_price: unitPrice,
      amount,
    };
    if (item.tax_category != null) mapped.tax_category = item.tax_category;
    if (item.cost_price != null && item.cost_price !== "") {
      const cp = parseInt(String(item.cost_price), 10);
      if (!isNaN(cp) && cp >= 0) mapped.cost_price = cp;
    }
    if (item.margin_rate != null && item.margin_rate !== "") {
      const mr = parseFloat(String(item.margin_rate));
      if (!isNaN(mr)) mapped.margin_rate = mr;
    }
    if (item.certificate_id) mapped.certificate_id = item.certificate_id;
    if (item.certificate_public_id) mapped.certificate_public_id = item.certificate_public_id;
    return mapped;
  });

  let subtotal: number;
  let tax: number;
  let total: number;
  if (isTaxInclusive) {
    // 税込入力モード：amount は税込金額。税抜の subtotal を逆算する
    total = itemsSum;
    subtotal = Math.round(itemsSum / (1 + taxRate / 100));
    tax = total - subtotal;
  } else {
    // 税抜入力モード（既定）
    subtotal = itemsSum;
    tax = Math.floor(subtotal * (taxRate / 100));
    total = subtotal + tax;
  }
  return { itemsJson, subtotal, tax, total };
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

    const parsed = documentCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;
    const docType = input.doc_type as DocType;
    if (!DOC_TYPES[docType]) {
      return apiValidationError("invalid doc_type");
    }

    const customerId = input.customer_id || null;
    const issuedAt = input.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = input.due_date || null;
    const note = input.note;
    const items = input.items ?? [];
    const taxRate = input.tax_rate ?? 10;
    const status = input.status;
    const isInvoiceCompliant = !!input.is_invoice_compliant;
    const sourceDocumentId = input.source_document_id || null;
    const showSeal = !!input.show_seal;
    const showLogo = input.show_logo !== false;
    const showBankInfo = !!input.show_bank_info;
    const recipientName = input.recipient_name;
    const recipientHonorific = input.recipient_honorific ?? "御中";
    const recipientPostalCode = input.recipient_postal_code;
    const recipientAddress = input.recipient_address;
    const recipientPhone = input.recipient_phone;
    const subject = input.subject;
    const periodStart = input.period_start;
    const periodEnd = input.period_end;
    const paymentTerms = input.payment_terms;
    const deliveryDate = input.delivery_date;
    const templateId = input.template_id;
    const isTaxInclusive = !!input.is_tax_inclusive;
    const metaJson = {
      ...(input.meta_json ?? {}),
      is_tax_inclusive: isTaxInclusive,
    };

    const { itemsJson, subtotal, tax, total } = calcItems(items, taxRate, isTaxInclusive);

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

    // RLS をバイパスしてサービスロールで INSERT（tenant_id で必ずスコープ限定）。
    // doc_number は採番→INSERT の間に競合し得るため、UNIQUE 索引 + 23505 リトライで
    // 二重採番を防ぐ（ユーザが番号を明示した場合はリトライせず 1 回のみ）。
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await insertDocWithRetry(
      admin,
      caller.tenantId,
      docType,
      DOC_TYPES[docType].prefix,
      (docNumber) =>
        admin
          .from("documents")
          .insert({ ...row, doc_number: docNumber })
          .select(
            "id, tenant_id, customer_id, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, items_json, note, meta_json, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, created_at, updated_at",
          )
          .single(),
      { fixedNumber: input.doc_number || null },
    );
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

    const parsed = documentUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data;
    const id = body.id;

    // 既存帳票の状態を確認し、内容編集の可否をチェック（ステータス変更は別途許可）
    const isContentEdit =
      body.items !== undefined ||
      body.recipient_name !== undefined ||
      body.recipient_postal_code !== undefined ||
      body.recipient_address !== undefined ||
      body.recipient_phone !== undefined ||
      body.subject !== undefined ||
      body.period_start !== undefined ||
      body.period_end !== undefined ||
      body.payment_terms !== undefined ||
      body.delivery_date !== undefined ||
      body.note !== undefined ||
      body.is_invoice_compliant !== undefined ||
      body.show_seal !== undefined ||
      body.show_logo !== undefined ||
      body.show_bank_info !== undefined ||
      body.tax_rate !== undefined ||
      body.is_tax_inclusive !== undefined;

    if (isContentEdit) {
      const { data: existing } = await supabase
        .from("documents")
        .select("doc_type, status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .single();
      if (existing && !isDocumentEditable(existing.doc_type, existing.status)) {
        return apiValidationError("送付済みの請求書は内容を編集できません。");
      }
    }

    // 「確定 (draft→sent)」を検出するため、ステータス更新時は変更前の状態を控える。
    let priorStatus: string | null = null;
    if (body.status === "sent") {
      const { data: prior } = await supabase
        .from("documents")
        .select("status")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      priorStatus = (prior?.status as string | null) ?? null;
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updates.status = body.status;
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null;
    if (body.issued_at !== undefined) updates.issued_at = body.issued_at;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.note !== undefined) updates.note = body.note;
    if (body.doc_number !== undefined) updates.doc_number = body.doc_number;
    if (body.is_invoice_compliant !== undefined) updates.is_invoice_compliant = !!body.is_invoice_compliant;
    if (body.show_seal !== undefined) updates.show_seal = !!body.show_seal;
    if (body.show_logo !== undefined) updates.show_logo = !!body.show_logo;
    if (body.show_bank_info !== undefined) updates.show_bank_info = !!body.show_bank_info;
    if (body.recipient_name !== undefined) updates.recipient_name = body.recipient_name;
    if (body.recipient_honorific !== undefined) updates.recipient_honorific = body.recipient_honorific;
    if (body.recipient_postal_code !== undefined) updates.recipient_postal_code = body.recipient_postal_code;
    if (body.recipient_address !== undefined) updates.recipient_address = body.recipient_address;
    if (body.recipient_phone !== undefined) updates.recipient_phone = body.recipient_phone;
    if (body.subject !== undefined) updates.subject = body.subject;
    if (body.period_start !== undefined) updates.period_start = body.period_start;
    if (body.period_end !== undefined) updates.period_end = body.period_end;
    if (body.payment_terms !== undefined) updates.payment_terms = body.payment_terms;
    if (body.delivery_date !== undefined) updates.delivery_date = body.delivery_date;
    if (body.template_id !== undefined) updates.template_id = body.template_id || null;
    if (body.meta_json !== undefined) updates.meta_json = body.meta_json;

    if (body.items !== undefined) {
      const taxRate = body.tax_rate ?? 10;
      const isTaxInclusive = !!body.is_tax_inclusive;
      const { itemsJson, subtotal, tax, total } = calcItems(body.items ?? [], taxRate, isTaxInclusive);
      updates.items_json = itemsJson;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = total;
      updates.tax_rate = taxRate;
      // meta_json は他の更新と共存させるため、明示的に渡された meta_json があればマージ
      const baseMeta = (body.meta_json as Record<string, unknown> | undefined) ?? {};
      updates.meta_json = { ...baseMeta, is_tax_inclusive: isTaxInclusive };
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

    // 確定 (draft→sent) の瞬間に、opt-in 済みテナントでは顧客へ自動送付する。
    // after(): レスポンス送出後も serverless 実行を保証して送付を完走させる。
    // 素の fire-and-forget だと Vercel 等でインスタンスが凍結/終了し、claim 作成 /
    // Stripe セッション / 外部送信の途中で送付が欠落しうる。ステータス更新自体は
    // 既にコミット済みなのでレスポンスは成功扱いのまま。
    if (priorStatus === "draft" && data?.status === "sent") {
      const baseUrl = resolveBaseUrl({ req });
      after(async () => {
        try {
          await maybeAutoSendDocumentOnConfirm({
            tenantId: caller.tenantId,
            documentId: id,
            actorUserId: caller.userId,
            baseUrl,
          });
        } catch {
          // maybeAutoSendDocumentOnConfirm は内部で握り潰すが、二重で保護する。
        }
      });
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

    const parsed = documentDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const id = parsed.data.id;

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
