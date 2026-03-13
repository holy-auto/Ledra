import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

async function resolvetenantId() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return { supabase, tenantId: null, error: "unauthorized" as const };

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  return { supabase, tenantId: (mem?.tenant_id as string) ?? null, error: null };
}

export async function GET() {
  const { supabase, tenantId, error } = await resolvetenantId();
  if (error || !tenantId) {
    return NextResponse.json({ error: error ?? "no_tenant" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("contact_phone, contact_email, contact_line, contact_note")
    .eq("id", tenantId)
    .single();

  return NextResponse.json({
    contact_phone: (tenant as any)?.contact_phone ?? "",
    contact_email: (tenant as any)?.contact_email ?? "",
    contact_line: (tenant as any)?.contact_line ?? "",
    contact_note: (tenant as any)?.contact_note ?? "",
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  const { supabase, tenantId, error } = await resolvetenantId();
  if (error || !tenantId) {
    return NextResponse.json({ error: error ?? "no_tenant" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const updates: Record<string, any> = {};
  if ("contact_phone" in body) updates.contact_phone = (body.contact_phone ?? "").toString().slice(0, 30) || null;
  if ("contact_email" in body) updates.contact_email = (body.contact_email ?? "").toString().slice(0, 200) || null;
  if ("contact_line" in body) updates.contact_line = (body.contact_line ?? "").toString().slice(0, 100) || null;
  if ("contact_note" in body) updates.contact_note = (body.contact_note ?? "").toString().slice(0, 500) || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no_fields" }, { status: 400 });
  }

  const { error: updateError } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", tenantId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
