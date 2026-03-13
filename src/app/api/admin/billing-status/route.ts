import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  const tenantId = mem?.tenant_id as string | undefined;
  if (!tenantId) {
    return NextResponse.json({ error: "no_tenant" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const { data: t, error } = await supabase
    .from("tenants")
    .select("id,name,plan_tier,is_active")
    .eq("id", tenantId)
    .single();

  if (error || !t) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json(
    {
      tenant_id: t.id,
      tenant_name: t.name ?? null,
      plan_tier: String(t.plan_tier ?? ""),
      is_active: !!t.is_active,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
