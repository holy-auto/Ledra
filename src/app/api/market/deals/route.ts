import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Create a deal ───
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const inquiryId = (body?.inquiry_id ?? "").trim();
    const vehicleId = (body?.vehicle_id ?? "").trim();
    const buyerName = (body?.buyer_name ?? "").trim();
    const buyerEmail = (body?.buyer_email ?? "").trim();

    if (!inquiryId || !vehicleId || !buyerName || !buyerEmail) {
      return apiValidationError("inquiry_id, vehicle_id, buyer_name, and buyer_email are required");
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
      .select(
        "id, inquiry_id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, agreed_price, status, created_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "market-deals insert");
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

    return apiJson({ ok: true, deal });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deals create");
  }
}

// ─── GET: List deals for caller's tenant ───
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
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
      return apiInternalError(error, "market-deals list");
    }

    return apiJson({ deals: deals ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deals list");
  }
}
