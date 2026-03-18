import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// ─── POST: Create inquiry (public, no auth required) ───
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const vehicleId = (body?.vehicle_id ?? "").trim();
    const buyerName = (body?.buyer_name ?? "").trim();
    const buyerEmail = (body?.buyer_email ?? "").trim();
    const message = (body?.message ?? "").trim();

    if (!vehicleId || !buyerName || !buyerEmail || !message) {
      return NextResponse.json(
        { error: "vehicle_id, buyer_name, buyer_email, and message are required" },
        { status: 400 },
      );
    }

    // Look up the vehicle to get seller tenant_id
    const { data: vehicle, error: vErr } = await admin
      .from("market_vehicles")
      .select("tenant_id")
      .eq("id", vehicleId)
      .single();

    if (vErr || !vehicle) {
      return NextResponse.json({ error: "vehicle_not_found" }, { status: 404 });
    }

    const row: Record<string, unknown> = {
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      seller_tenant_id: vehicle.tenant_id,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      message,
      status: "new",
    };

    if (body.buyer_company !== undefined) row.buyer_company = body.buyer_company;
    if (body.buyer_phone !== undefined) row.buyer_phone = body.buyer_phone;

    const { data: inquiry, error } = await admin
      .from("market_inquiries")
      .insert(row)
      .select()
      .single();

    if (error) {
      console.error("[market-inquiries] insert_failed:", error.message);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, inquiry });
  } catch (e: any) {
    console.error("market inquiry create failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

// ─── GET: List inquiries for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "";

    let query = admin
      .from("market_inquiries")
      .select("*, market_vehicles(maker, model)")
      .eq("seller_tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: inquiries, error } = await query;

    if (error) {
      console.error("[market-inquiries] db_error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ inquiries: inquiries ?? [] });
  } catch (e: any) {
    console.error("market inquiries list failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
