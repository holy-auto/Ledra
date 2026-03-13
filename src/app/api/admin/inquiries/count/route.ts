import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

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
    return NextResponse.json({ pending_count: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const { count, error } = await supabase
    .from("customer_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ pending_count: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ pending_count: count ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}
