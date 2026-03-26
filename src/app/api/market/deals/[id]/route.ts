import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDealStatusChanged } from "@/lib/market/email";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  negotiating: ["agreed", "cancelled"],
  agreed: ["completed", "cancelled"],
};

// ─── PATCH: Update deal status ───
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { id: dealId } = await params;
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({} as any));

    const newStatus = (body?.status ?? "").trim();
    if (!newStatus) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    // Fetch current deal
    const { data: deal, error: fetchErr } = await admin
      .from("market_deals")
      .select("id, status, vehicle_id, seller_tenant_id")
      .eq("id", dealId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (fetchErr || !deal) {
      return NextResponse.json({ error: "deal_not_found" }, { status: 404 });
    }

    // Validate status transition
    const allowed = VALID_TRANSITIONS[deal.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: "invalid_transition", detail: `Cannot transition from ${deal.status} to ${newStatus}` },
        { status: 400 },
      );
    }

    // Update deal
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (body.agreed_price !== undefined) updates.agreed_price = body.agreed_price;
    if (body.note !== undefined) updates.note = body.note;

    const { data: updatedDeal, error: updateErr } = await admin
      .from("market_deals")
      .update(updates)
      .eq("id", dealId)
      .select()
      .single();

    if (updateErr) {
      console.error("[market-deals] update_failed:", updateErr.message);
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }

    // Update vehicle status based on deal outcome
    if (newStatus === "completed") {
      await admin
        .from("market_vehicles")
        .update({ status: "sold", updated_at: new Date().toISOString() })
        .eq("id", deal.vehicle_id);
    } else if (newStatus === "cancelled") {
      await admin
        .from("market_vehicles")
        .update({ status: "listed", updated_at: new Date().toISOString() })
        .eq("id", deal.vehicle_id);
    }

    // Notify both parties of status change (non-blocking)
    try {
      const { data: fullDeal } = await admin
        .from("market_deals")
        .select("buyer_email, buyer_name, vehicle_id, seller_tenant_id, market_vehicles(maker, model, tenants(name, contact_email))")
        .eq("id", dealId)
        .single();
      const vehicle = (fullDeal as any)?.market_vehicles;
      const sellerName = vehicle?.tenants?.name ?? "出品者";
      const sellerEmail = vehicle?.tenants?.contact_email;
      const buyerEmail = (fullDeal as any)?.buyer_email;
      const buyerName = (fullDeal as any)?.buyer_name ?? "購入者";
      const vehicleLabel = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ") || "車両";

      if (buyerEmail) {
        notifyDealStatusChanged(buyerEmail, { vehicleLabel, newStatus, otherPartyName: sellerName }).catch((e) =>
          console.warn("[market] notifyDealStatusChanged (buyer) failed:", e)
        );
      }
      if (sellerEmail) {
        notifyDealStatusChanged(sellerEmail, { vehicleLabel, newStatus, otherPartyName: buyerName }).catch((e) =>
          console.warn("[market] notifyDealStatusChanged (seller) failed:", e)
        );
      }
    } catch (e) {
      console.warn("[market] deal status notification failed:", e);
    }

    return NextResponse.json({ ok: true, deal: updatedDeal });
  } catch (e: any) {
    console.error("market deal update failed", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
