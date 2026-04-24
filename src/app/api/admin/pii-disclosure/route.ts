import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
import { checkRateLimit } from "@/lib/api/rateLimit";

const piiDisclosureConsentSchema = z.object({
  certificate_id: z.string().uuid("certificate_id は必須です。"),
  insurer_id: z.string().uuid("insurer_id は必須です。"),
});

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "admin")) return apiForbidden("管理者権限が必要です。");

  const certificateId = req.nextUrl.searchParams.get("certificate_id");
  if (!certificateId) return apiValidationError("certificate_id は必須です。");

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  const { data: cert } = await admin.from("certificates").select("tenant_id").eq("id", certificateId).maybeSingle();

  if (!cert) return apiNotFound("証明書が見つかりません。");

  // Verify certificate belongs to caller's tenant
  if (cert.tenant_id !== caller.tenantId) return apiForbidden("他テナントの証明書にはアクセスできません。");

  const { data: consents, error } = await admin
    .from("pii_disclosure_consents")
    .select("*, insurers(name)")
    .eq("certificate_id", certificateId)
    .eq("is_active", true);

  if (error) return apiInternalError(error, "GET /api/admin/pii-disclosure");

  return apiJson({ consents: consents ?? [] });
}

export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const supabase = await createClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!requireMinRole(caller, "admin")) return apiForbidden("管理者権限が必要です。");

  const parsed = piiDisclosureConsentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
  }
  const { certificate_id, insurer_id } = parsed.data;

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  const { data: cert } = await admin.from("certificates").select("tenant_id").eq("id", certificate_id).maybeSingle();

  if (!cert) return apiNotFound("証明書が見つかりません。");

  // Verify certificate belongs to caller's tenant
  if (cert.tenant_id !== caller.tenantId) return apiForbidden("他テナントの証明書にはアクセスできません。");

  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .update({
      tenant_consented_at: new Date().toISOString(),
      tenant_consented_by: caller.userId,
    })
    .eq("certificate_id", certificate_id)
    .eq("insurer_id", insurer_id)
    .eq("is_active", true)
    .select(
      "id, certificate_id, insurer_id, tenant_consented_at, tenant_consented_by, is_active, created_at, updated_at",
    )
    .single();

  if (error) return apiInternalError(error, "POST /api/admin/pii-disclosure");
  if (!data) return apiNotFound("対象の開示リクエストが見つかりません。");

  return apiJson({ consent: data });
}
