import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  // auth check (insurer user)
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const q = url.searchParams.get("q") ?? "";
  const tenantFilter = url.searchParams.get("tenant_id") ?? "";
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const admin = getSupabaseAdmin();

  // build query
  let query = admin
    .from("customer_inquiries")
    .select("*, tenants!inner(name)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && ["pending", "replied", "closed"].includes(status)) {
    query = query.eq("status", status);
  }
  if (tenantFilter) {
    query = query.eq("tenant_id", tenantFilter);
  }
  if (q) {
    query = query.or(`sender_name.ilike.%${q}%,body.ilike.%${q}%,public_id.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const inquiries = (data ?? []).map((row: any) => ({
    ...row,
    tenant_name: row.tenants?.name ?? null,
    tenants: undefined,
  }));

  return NextResponse.json({ inquiries }, { headers: { "Cache-Control": "no-store" } });
}
