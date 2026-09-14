import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole, requirePermission } from "@/lib/auth/checkRole";
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
import { insertInvoiceWithRetry } from "@/lib/invoice/invoiceNumber";
import { autoRegisterMenuItems } from "@/lib/documents/autoRegisterMenuItems";

export const dynamic = "force-dynamic";

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

    // 統計はテナント全体で集計する（ページ内 enriched から出すと、ページングで
    // 未回収額/当月発行数が実態とずれるため）。未回収額は既存の集計 RPC を再利用。
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const [unpaidRes, monthRes] = await Promise.all([
      supabase.rpc("dashboard_unpaid_invoice_totals", { p_tenant_id: caller.tenantId }),
      supabase
        .from("documents")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("doc_type", "invoice")
        .gte("issued_at", thisMonthStart),
    ]);
    const unpaidAmount = Number(unpaidRes.data?.[0]?.unpaid_amount ?? 0);
    const thisMonthIssued = monthRes.count ?? 0;

    const headers = { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" };
    return apiJson(
      {
        invoices: enriched,
        stats: {
          total: totalCount ?? enriched.length,
          unpaid_amount: unpaidAmount,
          this_month_issued: thisMonthIssued,
        },
        ...(page > 0 && {
          pagination: {
            page,
            per_page: perPage,
            total: totalCount ?? enriched.length,
            total_pages: Math.ceil((totalCount ?? enriched.length) / perPage),
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
    if (!requirePermission(caller, "invoices:create")) return apiForbidden();

    const parsed = invoiceCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const input = parsed.data;

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
      const qty = parseFloat(String(item.quantity || 0)) || 0;
      const unitPrice = parseInt(String(item.unit_price || 0), 10);
      const amount = Math.round(qty * unitPrice);
      subtotal += amount;
      const lineRate = typeof item.tax_rate === "number" ? item.tax_rate : item.is_reduced_rate ? 8 : null;
      const mapped: Record<string, unknown> = {
        description: (item.description ?? "").trim(),
        quantity: qty,
        unit: (item.unit ?? "式").trim(),
        unit_price: unitPrice,
        amount,
      };
      if (item.item_code != null && String(item.item_code).trim()) mapped.item_code = String(item.item_code).trim();
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

    // doc_number は採番→INSERT の間に競合し得る。UNIQUE 索引 + 23505 リトライで
    // 二重採番を防ぐ（ユーザが番号を明示した場合はリトライせず 1 回のみ）。
    const { data, error } = await insertInvoiceWithRetry(
      admin,
      caller.tenantId,
      (docNumber) =>
        admin
          .from("documents")
          .insert({ ...row, doc_number: docNumber })
          .select(
            "id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, tax_breakdown, note, items_json, is_invoice_compliant, show_seal, show_logo, show_bank_info, recipient_name, vehicle_id, vehicle_info_json, created_at, updated_at",
          )
          .single(),
      { fixedNumber: input.invoice_number || null },
    );
    if (error || !data) {
      return apiInternalError(error, "invoices insert");
    }

    // 品目マスタに無い明細は自動登録する（保存自体は失敗させない fire-and-forget）
    after(async () => {
      try {
        await autoRegisterMenuItems(admin, caller.tenantId, items);
      } catch {
        // 自動登録の失敗は握り潰す（請求書保存自体は既に成功済み）
      }
    });

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
    if (!requirePermission(caller, "invoices:edit")) return apiForbidden();

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
        const qty = parseFloat(String(item.quantity || 0)) || 0;
        const unitPrice = parseInt(String(item.unit_price || 0), 10);
        const amount = Math.round(qty * unitPrice);
        subtotal += amount;
        const lineRate = typeof item.tax_rate === "number" ? item.tax_rate : item.is_reduced_rate ? 8 : null;
        const mapped: Record<string, unknown> = {
          description: (item.description ?? "").trim(),
          quantity: qty,
          unit: (item.unit ?? "式").trim(),
          unit_price: unitPrice,
          amount,
        };
        if (item.item_code != null && String(item.item_code).trim()) mapped.item_code = String(item.item_code).trim();
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

    // 品目マスタに無い明細は自動登録する（保存自体は失敗させない fire-and-forget）
    if (body.items !== undefined) {
      after(async () => {
        try {
          await autoRegisterMenuItems(admin, caller.tenantId, body.items ?? []);
        } catch {
          // 自動登録の失敗は握り潰す（請求書保存自体は既に成功済み）
        }
      });
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
          // 手動「入金済」更新は referenceNo が無く、連打で二重記帳し得る。
          // document + 金額で決まる安定キーを渡し、recordPayment 側の重複ガードに拾わせる。
          referenceNo: `manual:${data.id}:${Math.round(Number(data.total ?? 0))}`,
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
