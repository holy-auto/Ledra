import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getUser() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return data?.user ?? null;
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const certificateId = req.nextUrl.searchParams.get("certificate_id");
  if (!certificateId)
    return NextResponse.json({ error: "Missing certificate_id" }, { status: 400 });

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from("certificates")
    .select("tenant_id")
    .eq("id", certificateId)
    .maybeSingle();

  if (!cert)
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", cert.tenant_id)
    .maybeSingle();

  if (!membership)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { data: consents, error } = await admin
    .from("pii_disclosure_consents")
    .select("*, insurers(name)")
    .eq("certificate_id", certificateId)
    .eq("is_active", true);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ consents: consents ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { certificate_id, insurer_id } = body;
  if (!certificate_id || !insurer_id) {
    return NextResponse.json(
      { error: "Missing certificate_id or insurer_id" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from("certificates")
    .select("tenant_id")
    .eq("id", certificate_id)
    .maybeSingle();

  if (!cert)
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });

  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("id")
    .eq("user_id", user.id)
    .eq("tenant_id", cert.tenant_id)
    .maybeSingle();

  if (!membership)
    return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const { data, error } = await admin
    .from("pii_disclosure_consents")
    .update({
      tenant_consented_at: new Date().toISOString(),
      tenant_consented_by: user.id,
    })
    .eq("certificate_id", certificate_id)
    .eq("insurer_id", insurer_id)
    .eq("is_active", true)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data)
    return NextResponse.json(
      { error: "No pending disclosure request found" },
      { status: 404 },
    );

  return NextResponse.json({ consent: data });
}
