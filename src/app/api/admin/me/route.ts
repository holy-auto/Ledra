import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id, role")
      .eq("user_id", userRes.user.id)
      .limit(1)
      .single();

    if (!mem) {
      return NextResponse.json({ error: "no_membership" }, { status: 403 });
    }

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id, name, plan_tier")
      .eq("id", mem.tenant_id)
      .single();

    return NextResponse.json({
      user_id: userRes.user.id,
      email: userRes.user.email,
      tenant_id: mem.tenant_id,
      tenant_name: tenant?.name ?? null,
      plan_tier: tenant?.plan_tier ?? "free",
      role: mem.role ?? "admin",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
