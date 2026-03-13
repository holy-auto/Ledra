import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function resolveCallerTenant(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return null;

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userRes.user.id)
    .limit(1)
    .single();

  if (!mem?.tenant_id) return null;

  return {
    userId: userRes.user.id,
    tenantId: mem.tenant_id as string,
  };
}

// ─── POST: Create a deal ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const inquiryId = (body?.inquiry_id ?? "").trim();
    const vehicleId = (body?.vehicle_id ?? "").trim();
    const buyerName = (body?.buyer_name ?? "").trim();
    const buyerEmail = (body?.buyer_email ?? "").trim();

    if (!inquiryId || !vehicleId || !buyerName || !buyerEmail) {
      return NextResponse.json(
        { error: "inquiry_id, vehicle_id, buyer_name, and buyer_email are required" },
        { status: 400 },
      );
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      inquiry_id: inquiryId,
      vehicle_id: vehicleId,
      seller_tenant_id: caller.tenantId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      status: "negotiating",
    };

    if (body.buyer_company !== undefined) row.buyer_company = body.buyer_company;
    if (body.agreed_price !== undefined) row.agreed_price = body.agreed_price;

    const { data: deal, error } = await admin
      .from("market_deals")
      .insert(row)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "insert_failed", detail: error.message }, { status: 500 });
    }

    // Update the inquiry status to "in_negotiation"
    await admin
      .from("market_inquiries")
      .update({ status: "in_negotiation", updated_at: new Date().toISOString() })
      .eq("id", inquiryId);

    // Update the vehicle status to "reserved"
    await admin
      .from("market_vehicles")
      .update({ status: "reserved", updated_at: new Date().toISOString() })
      .eq("id", vehicleId);

    return NextResponse.json({ ok: true, deal });
  } catch (e: any) {
    console.error("market deal create failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

// ─── GET: List deals for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_deals")
      .select("*, market_vehicles(maker, model)")
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: deals, error } = await query;

    if (error) {
      return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ deals: deals ?? [] });
  } catch (e: any) {
    console.error("market deals list failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
