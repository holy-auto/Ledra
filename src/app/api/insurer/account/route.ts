import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiForbidden } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const admin = createAdminClient();
  const { data: insurer, error } = await admin
    .from("insurers")
    .select(
      "id, name, slug, plan_tier, status, contact_email, contact_phone, address, max_users, created_at",
    )
    .eq("id", caller.insurerId)
    .maybeSingle();

  if (error) return apiValidationError(error.message);

  const { count } = await admin
    .from("insurer_users")
    .select("id", { count: "exact", head: true })
    .eq("insurer_id", caller.insurerId)
    .eq("is_active", true);

  return NextResponse.json({ insurer, user_count: count ?? 0 });
}

export async function PATCH(req: NextRequest) {
  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  if (caller.role !== "admin") {
    return apiForbidden("管理者のみ編集できます。");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const allowedFields = ["contact_email", "contact_phone", "address"];
  const update: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  if (Object.keys(update).length === 0)
    return apiValidationError("No valid fields to update");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("insurers")
    .update(update)
    .eq("id", caller.insurerId)
    .select("id, name, slug, plan_tier, status, contact_email, contact_phone, address, max_users, created_at, updated_at")
    .single();

  if (error) return apiValidationError(error.message);

  return NextResponse.json({ insurer: data });
}
