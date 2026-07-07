import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { enforceBilling } from "@/lib/billing/guard";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { branchCreateSchema, branchUpdateSchema, branchDeleteSchema } from "@/lib/validations/customerBranch";

export const dynamic = "force-dynamic";

const BRANCH_COLUMNS =
  "id, customer_id, name, name_kana, postal_code, address, phone, contact_person, contact_email, note, created_at, updated_at";

// ─── GET: 支店一覧 (?customer_id=) ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const customerId = (new URL(req.url).searchParams.get("customer_id") ?? "").trim();
    if (!customerId) return apiValidationError("customer_id は必須です。");

    const { data, error } = await supabase
      .from("customer_branches")
      .select(BRANCH_COLUMNS)
      .eq("tenant_id", caller.tenantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });

    if (error) return apiInternalError(error, "customer-branches GET");
    return apiJson({ branches: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "customer-branches GET");
  }
}

// ─── POST: 支店追加 ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = branchCreateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 支店は親顧客に紐付く。渡された customer_id が自テナントの顧客か検証する
    // (他テナントの顧客IDにぶら下げられるのを防ぐ)。
    const { data: parent } = await admin
      .from("customers")
      .select("id")
      .eq("id", parsed.data.customer_id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (!parent) return apiValidationError("対象の顧客が見つかりません。");

    const { data, error } = await admin
      .from("customer_branches")
      .insert({ id: crypto.randomUUID(), tenant_id: caller.tenantId, ...parsed.data })
      .select(BRANCH_COLUMNS)
      .single();

    if (error) return apiInternalError(error, "customer-branches POST");
    return apiJson({ ok: true, branch: data });
  } catch (e) {
    return apiInternalError(e, "customer-branches POST");
  }
}

// ─── PUT: 支店更新 ───
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = branchUpdateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { id, ...fields } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("customer_branches")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .select(BRANCH_COLUMNS)
      .single();

    if (error) return apiInternalError(error, "customer-branches PUT");
    return apiJson({ ok: true, branch: data });
  } catch (e) {
    return apiInternalError(e, "customer-branches PUT");
  }
}

// ─── DELETE: 支店削除 ───
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "customer_update",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const parsed = branchDeleteSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { error } = await admin
      .from("customer_branches")
      .delete()
      .eq("id", parsed.data.id)
      .eq("tenant_id", caller.tenantId);

    if (error) return apiInternalError(error, "customer-branches DELETE");
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "customer-branches DELETE");
  }
}
