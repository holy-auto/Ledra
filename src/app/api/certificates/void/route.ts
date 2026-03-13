import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logCertificateAction, getRequestMeta } from "@/lib/audit/certificateLog";

const Body = z.object({
  public_id: z.string().min(10),
});

/**
 * POST /api/certificates/void
 * Authenticated void endpoint — requires logged-in user with tenant membership.
 * Kept at this path for backward compatibility; the canonical endpoint is
 * /api/admin/certificates/void.
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Auth check
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Tenant check
  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 403 });
  }

  // Verify certificate belongs to this tenant
  const admin = createAdminClient();
  const { data: cert, error: fetchErr } = await admin
    .from("certificates")
    .select("id, vehicle_id, status")
    .eq("tenant_id", tenantId)
    .eq("public_id", parsed.data.public_id)
    .limit(1)
    .maybeSingle();

  if (fetchErr || !cert) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (String(cert.status ?? "").toLowerCase() === "void") {
    return NextResponse.json({ ok: true, already_void: true });
  }

  const { error } = await admin
    .from("certificates")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("public_id", parsed.data.public_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit log (fire-and-forget)
  const { ip, userAgent } = getRequestMeta(req);
  logCertificateAction({
    type: "certificate_voided",
    tenantId,
    publicId: parsed.data.public_id,
    certificateId: cert.id,
    vehicleId: cert.vehicle_id ?? null,
    userId: userRes.user.id,
    description: "証明書を無効化 (void)",
    ip,
    userAgent,
  });

  return NextResponse.json({ ok: true });
}
