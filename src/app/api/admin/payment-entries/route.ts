import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { paymentEntryCreateSchema } from "@/lib/validations/payment-entry";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── GET: 入金履歴一覧 (documents / customers 結合) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const documentId = (url.searchParams.get("document_id") ?? "").trim();
    const customerId = (url.searchParams.get("customer_id") ?? "").trim();
    const fromDate = (url.searchParams.get("from_date") ?? "").trim();
    const toDate = (url.searchParams.get("to_date") ?? "").trim();

    let query = supabase
      .from("payment_entries")
      .select(
        "id, document_id, customer_id, amount, payment_method, payment_date, reference_no, notes, created_at, updated_at",
      )
      .eq("tenant_id", caller.tenantId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (documentId) query = query.eq("document_id", documentId);
    if (customerId) query = query.eq("customer_id", customerId);
    if (fromDate && DATE_RE.test(fromDate)) query = query.gte("payment_date", fromDate);
    if (toDate && DATE_RE.test(toDate)) query = query.lte("payment_date", toDate);

    const { data: entries, error } = await query;
    if (error) return apiInternalError(error, "payment-entries GET");

    // 帳票情報を並列取得 (doc_number / total)
    const documentIds = [...new Set((entries ?? []).map((e) => e.document_id).filter(Boolean))];
    const docMap: Record<string, { doc_number: string; total: number }> = {};
    if (documentIds.length > 0) {
      const { data: docs } = await supabase
        .from("documents")
        .select("id, doc_number, total")
        .eq("tenant_id", caller.tenantId)
        .in("id", documentIds);
      for (const d of docs ?? []) {
        docMap[d.id] = { doc_number: d.doc_number, total: d.total ?? 0 };
      }
    }

    // 顧客名を並列取得
    const customerIds = [...new Set((entries ?? []).map((e) => e.customer_id).filter(Boolean))];
    const customerNames: Record<string, string> = {};
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name")
        .eq("tenant_id", caller.tenantId)
        .in("id", customerIds as string[]);
      for (const c of customers ?? []) customerNames[c.id] = c.name;
    }

    const enriched = (entries ?? []).map((e) => ({
      ...e,
      amount: Number(e.amount ?? 0),
      doc_number: e.document_id ? (docMap[e.document_id]?.doc_number ?? null) : null,
      document_total: e.document_id ? (docMap[e.document_id]?.total ?? null) : null,
      customer_name: e.customer_id ? (customerNames[e.customer_id] ?? null) : null,
    }));

    const totalAmount = enriched.reduce((sum, e) => sum + e.amount, 0);

    return apiJson({ entries: enriched, stats: { total: enriched.length, total_amount: totalAmount } });
  } catch (e) {
    return apiInternalError(e, "payment-entries GET");
  }
}

// ─── POST: 入金登録 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = paymentEntryCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { document_id, amount, payment_method, payment_date, reference_no, notes } = parsed.data;

    // 帳票が自テナントに属するか検証し、顧客IDを継承する
    const { data: doc } = await supabase
      .from("documents")
      .select("id, customer_id")
      .eq("id", document_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!doc) return apiNotFound("帳票が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("payment_entries")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        document_id,
        customer_id: doc.customer_id ?? null,
        amount,
        payment_method,
        payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
        reference_no,
        notes,
        recorded_by: caller.userId,
      })
      .select(
        "id, document_id, customer_id, amount, payment_method, payment_date, reference_no, notes, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "payment-entries POST");

    return apiJson({ ok: true, entry: { ...data, amount: Number(data.amount ?? 0) } });
  } catch (e) {
    return apiInternalError(e, "payment-entries POST");
  }
}

// ─── DELETE: 入金削除 (?id=uuid) ───
export async function DELETE(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const url = new URL(req.url);
    const id = (url.searchParams.get("id") ?? "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return apiValidationError("無効なIDです。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("payment_entries").delete().eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "payment-entries DELETE");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "payment-entries DELETE");
  }
}
