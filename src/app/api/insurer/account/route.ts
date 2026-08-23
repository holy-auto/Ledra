import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiInternalError, apiJson, apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { insurerAccountUpdateSchema } from "@/lib/validations/insurer";
import { INSURER_PLAN_FEATURES } from "@/types/insurer";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { admin } = createInsurerScopedAdmin(caller.insurerId);
  const { data: insurer, error } = await admin
    .from("insurers")
    .select("id, name, slug, plan_tier, status, contact_email, contact_phone, address, created_at")
    .eq("id", caller.insurerId)
    .maybeSingle();

  if (error) return apiInternalError(error, "insurer.account");

  const { count } = await admin
    .from("insurer_users")
    .select("id", { count: "exact", head: true })
    .eq("insurer_id", caller.insurerId)
    .eq("is_active", true);

  // insurers に max_users 列は無い。上限はプランから決まるので API 側で付ける
  return apiJson({
    insurer: { ...insurer, max_users: INSURER_PLAN_FEATURES[caller.planTier]?.max_users ?? 3 },
    user_count: count ?? 0,
  });
}

export async function PATCH(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  if (caller.role !== "admin") {
    return apiForbidden("管理者のみ編集できます。");
  }

  const parsed = insurerAccountUpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) update[k] = v;
  }

  if (Object.keys(update).length === 0) return apiValidationError("No valid fields to update");

  const { admin } = createInsurerScopedAdmin(caller.insurerId);
  const { data, error } = await admin
    .from("insurers")
    .update(update)
    .eq("id", caller.insurerId)
    .select("id, name, slug, plan_tier, status, contact_email, contact_phone, address, created_at, updated_at")
    .single();

  if (error) return apiInternalError(error, "insurer.account");

  return apiJson({
    insurer: { ...data, max_users: INSURER_PLAN_FEATURES[caller.planTier]?.max_users ?? 3 },
  });
}
