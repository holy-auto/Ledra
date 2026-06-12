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
import { billingSplitCreateSchema, billingSplitUpdateSchema } from "@/lib/validations/billing-split";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_COLS =
  "id, document_id, split_type, payer_name, claim_number, split_amount, split_ratio, notes, created_at, updated_at";

/** numeric(12,0) は文字列で返るため number に正規化する */
function normalizeSplit<T extends { split_amount: unknown; split_ratio: unknown }>(row: T) {
  return {
    ...row,
    split_amount: Number(row.split_amount ?? 0),
    split_ratio: row.split_ratio == null ? null : Number(row.split_ratio),
  };
}

/** 帳票が自テナントに属するか確認し、属していれば total を返す。属さなければ null。 */
async function getOwnedDocument(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tenantId: string,
  documentId: string,
): Promise<{ id: string; total: number } | null> {
  const { data } = await supabase
    .from("documents")
    .select("id, total")
    .eq("id", documentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, total: Number(data.total ?? 0) };
}

// ─── GET: 帳票の按分一覧 (?document_id=uuid) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const documentId = (url.searchParams.get("document_id") ?? "").trim();
    if (!UUID_RE.test(documentId)) {
      return apiValidationError("帳票IDを指定してください。");
    }

    // 帳票が自テナントに属することを検証 (クロステナント閲覧の防止)
    const doc = await getOwnedDocument(supabase, caller.tenantId, documentId);
    if (!doc) return apiNotFound("帳票が見つかりません。");

    const { data: rows, error } = await supabase
      .from("billing_splits")
      .select(SELECT_COLS)
      .eq("tenant_id", caller.tenantId)
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "billing-splits GET");

    const splits = (rows ?? []).map(normalizeSplit);
    const splitTotal = splits.reduce((sum, s) => sum + s.split_amount, 0);

    return apiJson({
      splits,
      document_total: doc.total,
      stats: {
        count: splits.length,
        split_total: splitTotal,
        unallocated: doc.total - splitTotal,
      },
    });
  } catch (e) {
    return apiInternalError(e, "billing-splits GET");
  }
}

// ─── POST: 按分作成 ───
export async function POST(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = billingSplitCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { document_id, split_type, payer_name, claim_number, split_amount, split_ratio, notes } = parsed.data;

    // 帳票が自テナントに属するか検証 (client 由来の document_id を信用しない)
    const doc = await getOwnedDocument(supabase, caller.tenantId, document_id);
    if (!doc) return apiNotFound("帳票が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("billing_splits")
      .insert({
        id: crypto.randomUUID(),
        tenant_id: caller.tenantId,
        document_id,
        split_type,
        payer_name,
        claim_number,
        split_amount,
        split_ratio: split_ratio ?? null,
        notes,
      })
      .select(SELECT_COLS)
      .single();
    if (error) return apiInternalError(error, "billing-splits POST");

    return apiJson({ ok: true, split: normalizeSplit(data) });
  } catch (e) {
    return apiInternalError(e, "billing-splits POST");
  }
}

// ─── PATCH: 按分更新 (body に id) ───
export async function PATCH(req: NextRequest) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = billingSplitUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const body = parsed.data;

    // 対象按分が自テナントに存在することを確認
    const { data: existing } = await supabase
      .from("billing_splits")
      .select("id")
      .eq("id", body.id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!existing) return apiNotFound("按分が見つかりません。");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.split_type !== undefined) updates.split_type = body.split_type;
    if (body.payer_name !== undefined) updates.payer_name = body.payer_name;
    if (body.claim_number !== undefined) updates.claim_number = body.claim_number;
    if (body.split_amount !== undefined) updates.split_amount = body.split_amount;
    if (body.split_ratio !== undefined) updates.split_ratio = body.split_ratio;
    if (body.notes !== undefined) updates.notes = body.notes;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("billing_splits")
      .update(updates)
      .eq("id", body.id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLS)
      .single();
    if (error) return apiInternalError(error, "billing-splits PATCH");

    return apiJson({ ok: true, split: normalizeSplit(data) });
  } catch (e) {
    return apiInternalError(e, "billing-splits PATCH");
  }
}

// ─── DELETE: 按分削除 (?id=uuid) ───
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
    if (!UUID_RE.test(id)) {
      return apiValidationError("無効なIDです。");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin.from("billing_splits").delete().eq("id", id).eq("tenant_id", caller.tenantId);
    if (error) return apiInternalError(error, "billing-splits DELETE");

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "billing-splits DELETE");
  }
}
