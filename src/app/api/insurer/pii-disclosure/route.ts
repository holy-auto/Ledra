import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError } from "@/lib/api/response";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const certificateId = req.nextUrl.searchParams.get("certificate_id");
  if (!certificateId) return apiValidationError("Missing certificate_id");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .select("id, certificate_id, insurer_id, insurer_requested_at, insurer_requested_by, insurer_reason, tenant_consented_at, is_active, created_at, updated_at")
    .eq("certificate_id", certificateId)
    .eq("insurer_id", caller.insurerId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return apiValidationError(error.message);

  const disclosed =
    data &&
    data.insurer_requested_at !== null &&
    data.tenant_consented_at !== null;

  return NextResponse.json({
    consent: data,
    disclosed,
    insurer_requested: !!data?.insurer_requested_at,
    tenant_consented: !!data?.tenant_consented_at,
  });
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const { certificate_id, reason } = body as { certificate_id?: string; reason?: string };
  if (!certificate_id) return apiValidationError("Missing certificate_id");

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .upsert(
      {
        certificate_id,
        insurer_id: caller.insurerId,
        insurer_requested_at: new Date().toISOString(),
        insurer_requested_by: caller.userId,
        insurer_reason: reason || null,
        is_active: true,
      },
      { onConflict: "certificate_id,insurer_id" },
    )
    .select("id, certificate_id, insurer_id, insurer_requested_at, insurer_requested_by, insurer_reason, tenant_consented_at, is_active, created_at, updated_at")
    .single();

  if (error) return apiValidationError(error.message);

  await admin.from("insurer_access_logs").insert({
    insurer_id: caller.insurerId,
    insurer_user_id: caller.insurerUserId,
    certificate_id,
    action: "pii_disclosure_request",
    meta: { reason: reason || null },
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ consent: data });
}
