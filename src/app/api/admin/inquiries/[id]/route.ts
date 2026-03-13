import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const newStatus = body.status as string | undefined;
  const adminNotes = body.admin_notes as string | undefined;

  if (newStatus && !["pending", "replied", "closed"].includes(newStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  // verify ownership
  const { data: existing } = await supabase
    .from("customer_inquiries")
    .select("id, tenant_id")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (newStatus) {
    updates.status = newStatus;
    if (newStatus === "replied") updates.replied_at = new Date().toISOString();
    if (newStatus === "closed") updates.closed_at = new Date().toISOString();
  }
  if (adminNotes !== undefined) updates.admin_notes = adminNotes;

  const { data: updated, error } = await supabase
    .from("customer_inquiries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inquiry: updated });
}
