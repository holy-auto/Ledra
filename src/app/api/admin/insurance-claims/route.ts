import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import {
  insuranceClaimCreateSchema,
  insuranceClaimUpdateSchema,
  INSURANCE_CLAIM_STATUSES,
  type InsuranceClaimStatus,
} from "@/lib/validations/insurance-claim";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 一覧で返すカラム。body_repair_jobs を context として join する。 */
const SELECT_COLUMNS = `
  id, body_repair_job_id, reservation_id,
  insurance_company, claim_number, adjuster_name, adjuster_phone,
  status, adjuster_visit_date,
  agreed_amount, deductible_amount, customer_burden,
  submitted_at, agreed_at, paid_at,
  notes, created_at, updated_at,
  body_repair_job:body_repair_jobs ( id, stage )
`;

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** body_repair_job_id が指定されていれば自テナントに属するか検証する。 */
async function validateJobRef(
  admin: ReturnType<typeof createTenantScopedAdmin>["admin"],
  tenantId: string,
  jobId: string | null,
): Promise<string | null> {
  if (!jobId) return null;
  const { data, error } = await admin
    .from("body_repair_jobs")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return "指定された鈑金案件が見つかりません。";
  return null;
}

// ─── GET: 協定一覧 (status / body_repair_job_id で絞り込み) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const url = new URL(req.url);
    const statusParam = (url.searchParams.get("status") ?? "").trim();
    const status = (INSURANCE_CLAIM_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as InsuranceClaimStatus)
      : null;
    const jobId = (url.searchParams.get("body_repair_job_id") ?? "").trim() || null;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    let query = admin
      .from("insurance_claims")
      .select(SELECT_COLUMNS)
      .eq("tenant_id", caller.tenantId) // REQUIRED: admin bypasses RLS
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);
    if (jobId) query = query.eq("body_repair_job_id", jobId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "insurance-claims GET");

    return apiJson({ ok: true, claims: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "insurance-claims GET");
  }
}

// ─── POST: 協定作成 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, insuranceClaimCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { body_repair_job_id, ...rest } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const refError = await validateJobRef(admin, caller.tenantId, body_repair_job_id);
    if (refError) return apiValidationError(refError);

    const { data: created, error } = await admin
      .from("insurance_claims")
      .insert({
        ...rest,
        body_repair_job_id,
        tenant_id: caller.tenantId,
      })
      .select(SELECT_COLUMNS)
      .single();
    if (error) return apiInternalError(error, "insurance-claims POST");

    return apiJson({ ok: true, claim: created }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "insurance-claims POST");
  }
}

// ─── PATCH: 協定更新 (status 遷移で日付を自動セット) ───
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = await parseJsonBody(req, insuranceClaimUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const { id, body_repair_job_id, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    if (body_repair_job_id !== undefined) {
      const refError = await validateJobRef(admin, caller.tenantId, body_repair_job_id);
      if (refError) return apiValidationError(refError);
    }

    // 部分更新: undefined のキーは送らない (null は「明示的にクリア」として扱う)。
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) updates[k] = v;
    }
    if (body_repair_job_id !== undefined) updates.body_repair_job_id = body_repair_job_id;

    // status 遷移時に対応する日付が未指定なら今日を自動セットする。
    const today = todayString();
    if (fields.status === "agreed" && fields.agreed_at === undefined) {
      updates.agreed_at = today;
    }
    if (fields.status === "paid" && fields.paid_at === undefined) {
      updates.paid_at = today;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新する項目がありません。");
    }

    const { data: updated, error } = await admin
      .from("insurance_claims")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(SELECT_COLUMNS)
      .maybeSingle();
    if (error) return apiInternalError(error, "insurance-claims PATCH");
    if (!updated) return apiNotFound("対象の保険協定が見つかりません。");

    return apiJson({ ok: true, claim: updated });
  } catch (e) {
    return apiInternalError(e, "insurance-claims PATCH");
  }
}
