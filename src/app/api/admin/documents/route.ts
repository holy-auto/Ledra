import { NextRequest, after } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { DOC_TYPES, isDocumentEditable, isDocumentDeletable, type DocType } from "@/types/document";
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
import { documentCreateSchema, documentUpdateSchema, documentDeleteSchema } from "@/lib/validations/document";
import { resolveBaseUrl } from "@/lib/url";
import { maybeAutoSendDocumentOnConfirm } from "@/lib/ai/automation/documentAuto";
import { insertDocWithRetry } from "@/lib/invoice/invoiceNumber";
import { autoRegisterMenuItems } from "@/lib/documents/autoRegisterMenuItems";
import { calcItems } from "@/lib/documents/calcItems";
import { isValidRegistrationNumber } from "@/lib/invoice/taxBreakdown";
import { recordInvoicePaymentBalance } from "@/lib/invoice/recordPayment";
import { sealDocumentOnFinalize, type SealableDocument } from "@/lib/documents/documentSeal";

export const dynamic = "force-dynamic";

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
    // 発行日 (issued_at) による期間絞り込み。YYYY-MM-DD 形式のみ受け付ける。
    const dateFromRaw = url.searchParams.get("date_from") ?? "";
    const dateToRaw = url.searchParams.get("date_to") ?? "";
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const dateFrom = isoDate.test(dateFromRaw) ? dateFromRaw : "";
    const dateTo = isoDate.test(dateToRaw) ? dateToRaw : "";
    // 電帳法「可視性の確保」: 取引金額（total）と取引先で検索できるようにする。
    const parseAmount = (raw: string | null): number | null => {
      const n = Number((raw ?? "").trim());
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    };
    const amountMin = parseAmount(url.searchParams.get("amount_min"));
    const amountMax = parseAmount(url.searchParams.get("amount_max"));
    const counterpartyRaw = (url.searchParams.get("counterparty") ?? "").trim();
    // PostgREST の or() フィルタ文字列を壊す区切り文字は除去してから ilike パターン化する。
    const counterparty = counterpartyRaw.replace(/[,()*%]/g, "").slice(0, 100);
    const { page, perPage, from, to } = parsePagination(req, { maxPerPage: 200 });

    const selectCols =
      "id, tenant_id, customer_id, staff_member_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, note, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, created_at, updated_at";

    // 本番で帳票一覧が「非決定的に0件」になる事象への恒久対処。
    // - ユーザーセッション(RLS)経由は documents に対して実行時に0件を返すことがある
    //   （resolveCallerWithRole の tenant_memberships 読取は効くのに documents は0）。
    // - サービスロール経由は RLS/JWT に依存せず決定的だが、本番の
    //   SUPABASE_SERVICE_ROLE_KEY が anon 相当だと0件になる。
    // どちらか一方が壊れていても表示できるよう「サービスロール優先→0件ならユーザー
    // セッションへフォールバック」の二重取得にする。caller.tenantId は所属検証済み。
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 取引先検索: 顧客名一致の customer_id を先に解決して OR 条件に含める。
    let orExpr: string | null = null;
    if (counterparty) {
      const { data: matchedCustomers } = await admin
        .from("customers")
        .select("id")
        .eq("tenant_id", caller.tenantId)
        .ilike("name", `%${counterparty}%`)
        .limit(200);
      const ids = (matchedCustomers ?? []).map((c) => c.id);
      const orParts = [`recipient_name.ilike.%${counterparty}%`];
      if (ids.length > 0) orParts.push(`customer_id.in.(${ids.join(",")})`);
      orExpr = orParts.join(",");
    }

    type DocClient = typeof admin;
    const buildList = (client: DocClient) => {
      let q = client
        .from("documents")
        .select(selectCols)
        .eq("tenant_id", caller.tenantId)
        .order("created_at", { ascending: false });
      if (docType) q = q.eq("doc_type", docType);
      if (status && status !== "all") q = q.eq("status", status);
      if (customerId) q = q.eq("customer_id", customerId);
      if (dateFrom) q = q.gte("issued_at", dateFrom);
      if (dateTo) q = q.lte("issued_at", dateTo);
      if (amountMin !== null) q = q.gte("total", amountMin);
      if (amountMax !== null) q = q.lte("total", amountMax);
      if (orExpr) q = q.or(orExpr);
      if (page > 0) q = q.range(from, to);
      return q;
    };
    const buildCount = (client: DocClient) => {
      let q = client.from("documents").select("*", { count: "exact", head: true }).eq("tenant_id", caller.tenantId);
      if (docType) q = q.eq("doc_type", docType);
      if (status && status !== "all") q = q.eq("status", status);
      if (customerId) q = q.eq("customer_id", customerId);
      if (dateFrom) q = q.gte("issued_at", dateFrom);
      if (dateTo) q = q.lte("issued_at", dateTo);
      if (amountMin !== null) q = q.gte("total", amountMin);
      if (amountMax !== null) q = q.lte("total", amountMax);
      if (orExpr) q = q.or(orExpr);
      return q;
    };

    // 1) サービスロール優先（キー是正済みなら決定的に全件取得）
    let { data: docs, error } = await buildList(admin);
    let totalCount: number | null = null;
    let dataClient: DocClient = admin;
    if (!error) {
      totalCount = (await buildCount(admin)).count ?? null;
    }
    // 2) サービスロールが 0 件/失敗ならユーザーセッション(RLS)へフォールバック（逐次）
    const userClient = supabase as unknown as DocClient;
    if (error || !docs || docs.length === 0) {
      const u = await buildList(userClient);
      if (!u.error && u.data && u.data.length > 0) {
        docs = u.data;
        error = null;
        dataClient = userClient;
        totalCount = (await buildCount(userClient)).count ?? docs.length;
      } else if (error && u.error) {
        // 両経路とも失敗した場合のみエラー返却
        return apiInternalError(error, "documents GET");
      }
    }

    // 顧客名を取得（データを返せたクライアントで逐次取得）
    const customerIds = [...new Set((docs ?? []).map((d) => d.customer_id).filter(Boolean))];
    const customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await dataClient
        .from("customers")
        .select("id, name")
        .eq("tenant_id", caller.tenantId)
        .in("id", customerIds);
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
    // staff_invoice はテナントが外注職人へ「支払う」金額（未払費用）であり、
    // 顧客からの「未入金額」（売掛金）とは意味が逆なので合算しない。
    const unpaidAmount = enriched
      .filter((d) => (d.status === "sent" || d.status === "accepted") && d.doc_type !== "staff_invoice")
      .reduce((sum, d) => sum + (d.total ?? 0), 0);

    // 一時診断: サービスロールキー(SUPABASE_SERVICE_ROLE_KEY)の role クレームと接続先を
    // 確認する（キー本体は出さない）。anon が入っていれば env の設定ミスが確定する。
    let keyRole: string | null = null;
    try {
      const k = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
      const payloadB64 = k.split(".")[1];
      if (payloadB64) {
        const json = JSON.parse(Buffer.from(payloadB64, "base64").toString("utf8")) as { role?: string };
        keyRole = json.role ?? null;
      } else {
        keyRole = k ? "not_a_jwt" : "empty";
      }
    } catch {
      keyRole = "decode_error";
    }
    let projectRef: string | null = null;
    try {
      projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "").host.split(".")[0] || null;
    } catch {
      projectRef = null;
    }
    // 一時診断: admin(service_role/PostgREST) が実際に何件見えているかを直接確認する。
    // adminAllDocs=0 なら PostgREST が別データ源(空)を見ている、adminAllDocs>0 かつ
    // adminE724=0 ならテナントIDの不一致、と切り分けられる。
    const { count: adminAllDocs } = await admin.from("documents").select("*", { count: "exact", head: true });
    const { count: adminE724 } = await admin
      .from("documents")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", "e724ef83-7dfe-422a-a967-14ff8eec14a4");

    return apiJson({
      documents: enriched,
      stats: { total: totalCount ?? total, unpaid_amount: unpaidAmount },
      _diag: {
        source: dataClient === admin ? "admin" : "user",
        returned: enriched.length,
        totalCount: totalCount ?? null,
        serviceKeyRole: keyRole,
        projectRef,
        callerTenantId: caller.tenantId,
        callerTidLen: String(caller.tenantId ?? "").length,
        callerTidRaw: JSON.stringify(caller.tenantId),
        adminAllDocs: adminAllDocs ?? null,
        adminE724: adminE724 ?? null,
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
    // 外注請求書（内部精算・金銭データ）は staff_members と同じ管理ロール限定にする。
    // RLS 側にも RESTRICTIVE ポリシーがあるが、この POST は service-role でRLSを
    // バイパスするため、API 層でも明示的にガードする。
    if (docType === "staff_invoice" && !requireMinRole(caller, "admin")) {
      return apiForbidden("外注請求書の作成は管理者ロールのみ可能です。");
    }

    const customerId = input.customer_id || null;
    const staffMemberId = input.staff_member_id || null;
    const issuedAt = input.issued_at || new Date().toISOString().slice(0, 10);
    const dueDate = input.due_date || null;
    const note = input.note;
    const items = input.items ?? [];
    const taxRate = input.tax_rate ?? 10;
    const status = input.status;
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
    const paymentDate = input.payment_date || null;
    const vehicleId = input.vehicle_id || null;
    const vehicleInfo = input.vehicle_info ?? {};
    const isTaxInclusive = !!input.is_tax_inclusive;
    const metaJson = {
      ...(input.meta_json ?? {}),
      is_tax_inclusive: isTaxInclusive,
    };

    // 適格請求書フラグは「明示 ON」かつ「テナントの登録番号が T+13桁」のときのみ ON。
    // フォーマット不正 / 未設定なら強制 OFF にして、PDF 上で「インボイス対応」表記が
    // 出ないようにする (受領側で仕入税額控除に使われる誤解を防ぐ)。
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const tenantInfo = await admin
      .from("tenants")
      .select("registration_number")
      .eq("id", caller.tenantId)
      .maybeSingle();
    const tenantRegNumberValid = isValidRegistrationNumber(tenantInfo.data?.registration_number ?? null);
    const isInvoiceCompliant = !!input.is_invoice_compliant && tenantRegNumberValid;

    // staff_member_id は他テナントの staff_members を指せてしまわないよう検証し、
    // 併せて宛先名（PDF・詳細画面表示用）に職人名を補完する。
    let staffMemberName: string | null = null;
    if (docType === "staff_invoice") {
      if (!staffMemberId) return apiValidationError("外注職人を選択してください。");
      const { data: staffRow } = await admin
        .from("staff_members")
        .select("name")
        .eq("id", staffMemberId)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (!staffRow) return apiValidationError("無効な外注職人が指定されました。");
      staffMemberName = staffRow.name;
    }

    const { itemsJson, subtotal, tax, total, taxBreakdown } = calcItems(items, taxRate, isTaxInclusive);

    const row = {
      id: crypto.randomUUID(),
      tenant_id: caller.tenantId,
      customer_id: customerId,
      staff_member_id: staffMemberId,
      recipient_name: recipientName || staffMemberName,
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
      payment_date: paymentDate,
      vehicle_id: vehicleId,
      vehicle_info_json: vehicleInfo,
      doc_type: docType,
      issued_at: issuedAt,
      due_date: dueDate,
      status,
      subtotal,
      tax,
      total,
      tax_rate: taxRate,
      tax_breakdown: taxBreakdown,
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
            "id, tenant_id, customer_id, staff_member_id, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, payment_date, vehicle_id, vehicle_info_json, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, tax_breakdown, items_json, note, meta_json, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, created_at, updated_at",
          )
          .single(),
      { fixedNumber: input.doc_number || null },
    );
    if (error) {
      return apiInternalError(error, "documents POST");
    }

    // 品目マスタに無い明細は自動登録する（保存自体は失敗させない fire-and-forget）。
    // staff_invoice の明細は cost_price/margin_rate が「案件金額/レス率」という別意味
    // なので、通常の原価/利益率として品目マスタへ登録してしまわないよう除外する。
    if (docType !== "staff_invoice") {
      after(async () => {
        try {
          await autoRegisterMenuItems(admin, caller.tenantId, items);
        } catch {
          // 自動登録の失敗は握り潰す（帳票保存自体は既に成功済み）
        }
      });
    }

    // 下書きを経ずに「確定 (status=sent)」で直接作成された帳票も封印対象にする
    // （PUT の draft→sent 遷移を通らないため、ここでも同じ封印を掛ける）。
    if (data?.status === "sent") {
      after(async () => {
        try {
          await sealDocumentOnFinalize(
            admin,
            caller.tenantId,
            data as SealableDocument & { id: string; meta_json?: unknown },
          );
        } catch (sealErr) {
          console.error("documents POST: integrity seal failed (non-blocking)", sealErr);
        }
      });
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
      body.staff_member_id !== undefined ||
      body.recipient_name !== undefined ||
      body.recipient_postal_code !== undefined ||
      body.recipient_address !== undefined ||
      body.recipient_phone !== undefined ||
      body.subject !== undefined ||
      body.period_start !== undefined ||
      body.period_end !== undefined ||
      body.payment_terms !== undefined ||
      body.delivery_date !== undefined ||
      body.vehicle_id !== undefined ||
      body.vehicle_info !== undefined ||
      body.note !== undefined ||
      body.is_invoice_compliant !== undefined ||
      body.show_seal !== undefined ||
      body.show_logo !== undefined ||
      body.show_bank_info !== undefined ||
      body.tax_rate !== undefined ||
      body.is_tax_inclusive !== undefined;

    // 状態確認は PUT 全体で使うため（内容編集ガード・入金記帳の doc_type 判定）、
    // isContentEdit の有無に関わらず一度だけ取得する。
    const { data: existing } = await supabase
      .from("documents")
      .select("doc_type, status")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .single();

    if (isContentEdit && existing && !isDocumentEditable(existing.doc_type, existing.status)) {
      return apiValidationError("送付済みの請求書は内容を編集できません。");
    }

    // 外注請求書（金銭データ）は staff_members と同じ管理ロール限定にする。
    // POST 側と同じ理由（service-role で RLS をバイパスするため）で API 層でもガードする。
    if (existing?.doc_type === "staff_invoice" && !requireMinRole(caller, "admin")) {
      return apiForbidden("外注請求書の更新は管理者ロールのみ可能です。");
    }

    // 「確定 (draft→sent)」を検出するため、ステータス更新時は変更前の状態を控える。
    const priorStatus: string | null = body.status !== undefined ? (existing?.status ?? null) : null;

    // RLS をバイパスしてサービスロールで UPDATE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // staff_member_id を変更する場合、他テナントの staff_members を指せないよう検証する。
    if (body.staff_member_id) {
      const { data: staffRow } = await admin
        .from("staff_members")
        .select("id")
        .eq("id", body.staff_member_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (!staffRow) return apiValidationError("無効な外注職人が指定されました。");
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) updates.status = body.status;
    if (body.customer_id !== undefined) updates.customer_id = body.customer_id || null;
    if (body.staff_member_id !== undefined) updates.staff_member_id = body.staff_member_id || null;
    if (body.issued_at !== undefined) updates.issued_at = body.issued_at;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.payment_date !== undefined) updates.payment_date = body.payment_date || null;
    if (body.vehicle_id !== undefined) updates.vehicle_id = body.vehicle_id || null;
    if (body.vehicle_info !== undefined) updates.vehicle_info_json = body.vehicle_info ?? {};
    if (body.note !== undefined) updates.note = body.note;
    if (body.doc_number !== undefined) updates.doc_number = body.doc_number;
    if (body.is_invoice_compliant !== undefined) {
      // 登録番号フォーマット未通過なら、明示 ON でも強制 OFF にする (PDF 表示と整合)
      if (body.is_invoice_compliant) {
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
      const { itemsJson, subtotal, tax, total, taxBreakdown } = calcItems(body.items ?? [], taxRate, isTaxInclusive);
      updates.items_json = itemsJson;
      updates.subtotal = subtotal;
      updates.tax = tax;
      updates.total = total;
      updates.tax_rate = taxRate;
      updates.tax_breakdown = taxBreakdown;
      // meta_json は他の更新と共存させるため、明示的に渡された meta_json があればマージ
      const baseMeta = (body.meta_json as Record<string, unknown> | undefined) ?? {};
      updates.meta_json = { ...baseMeta, is_tax_inclusive: isTaxInclusive };
    }

    const { data, error } = await admin
      .from("documents")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(
        "id, tenant_id, customer_id, staff_member_id, recipient_name, recipient_honorific, recipient_postal_code, recipient_address, recipient_phone, subject, period_start, period_end, payment_terms, delivery_date, template_id, payment_date, vehicle_id, vehicle_info_json, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, tax_breakdown, items_json, note, meta_json, is_invoice_compliant, source_document_id, show_seal, show_logo, show_bank_info, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "documents PUT");
    }

    // 品目マスタに無い明細は自動登録する（保存自体は失敗させない fire-and-forget）。
    // staff_invoice は cost_price/margin_rate が別意味のため対象外（POST と同じ理由）。
    if (body.items !== undefined && data?.doc_type !== "staff_invoice") {
      after(async () => {
        try {
          await autoRegisterMenuItems(admin, caller.tenantId, body.items ?? []);
        } catch {
          // 自動登録の失敗は握り潰す（帳票保存自体は既に成功済み）
        }
      });
    }

    // 請求書が「入金済」に更新されたら売掛元帳 (payment_entries) にも残高分を記帳して
    // 消込を整合させる (status=paid だけだと元帳上は未消込のまま残るため)。
    // 記帳失敗は status 更新 (主) を巻き戻さず log のみ (best-effort)。
    if (body.status === "paid" && (data?.doc_type === "invoice" || data?.doc_type === "consolidated_invoice")) {
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
        console.error("documents PUT: ledger entry failed (non-blocking)", ledgerErr);
      }
    }

    // 確定 (draft→sent) の瞬間に、opt-in 済みテナントでは顧客へ自動送付する。
    // after(): レスポンス送出後も serverless 実行を保証して送付を完走させる。
    // 素の fire-and-forget だと Vercel 等でインスタンスが凍結/終了し、claim 作成 /
    // Stripe セッション / 外部送信の途中で送付が欠落しうる。ステータス更新自体は
    // 既にコミット済みなのでレスポンスは成功扱いのまま。
    if (priorStatus === "draft" && data?.status === "sent") {
      const baseUrl = resolveBaseUrl({ req });
      const isEstimate = data?.doc_type === "estimate";
      after(async () => {
        // 電帳法「真実性の確保」: 確定した帳票に内容ハッシュ＋TS 封印を付ける（best-effort）。
        try {
          await sealDocumentOnFinalize(
            admin,
            caller.tenantId,
            data as SealableDocument & { id: string; meta_json?: unknown },
          );
        } catch (sealErr) {
          console.error("documents PUT: integrity seal failed (non-blocking)", sealErr);
        }
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
        // 見積書の送付なら、その見積りに紐づく会話フローを可否待ちへ進め、
        // 顧客に可否ボタンを送る (opt-in / 該当フロー無しは no-op / 内部で fail-soft)。
        if (isEstimate) {
          try {
            const { maybeAdvanceFlowOnQuoteSent } = await import("@/lib/ai/automation/conversationFlowPostback");
            await maybeAdvanceFlowOnQuoteSent({ tenantId: caller.tenantId, documentId: id });
          } catch {
            // fail-soft
          }
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
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = documentDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const ids = parsed.data.ids ?? [parsed.data.id!];

    const { data: docs } = await supabase
      .from("documents")
      .select("id, status, doc_type")
      .in("id", ids)
      .eq("tenant_id", caller.tenantId);

    if (!docs || docs.length === 0) return apiNotFound("帳票が見つかりません。");

    const eligible = docs.filter((d) => isDocumentDeletable(d.doc_type, d.status));
    if (eligible.length === 0) {
      return apiValidationError("下書きステータスの帳票、または領収書のみ削除できます。");
    }

    // RLS をバイパスしてサービスロールで DELETE（tenant_id で必ずスコープ限定）
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const eligibleIds = eligible.map((d) => d.id);
    const { error } = await admin.from("documents").delete().in("id", eligibleIds).eq("tenant_id", caller.tenantId);

    if (error) {
      // 23503: 他の帳票の source_document_id からまだ参照されている（変換元として使われた帳票）
      if (error.code === "23503") {
        return apiValidationError("他の帳票の作成元になっている帳票は削除できません。");
      }
      return apiInternalError(error, "documents DELETE");
    }

    return apiJson({ ok: true, deleted: eligibleIds.length, skipped: docs.length - eligibleIds.length });
  } catch (e) {
    return apiInternalError(e, "documents DELETE");
  }
}
