import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDealStatusChanged } from "@/lib/market/email";
import { apiUnauthorized, apiNotFound, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  negotiating: ["agreed", "cancelled"],
  agreed: ["completed", "cancelled"],
};

// ─── PATCH: Update deal status ───
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: dealId } = await params;
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);

    const newStatus = (body?.status ?? "").trim();
    if (!newStatus) {
      return apiValidationError("status is required");
    }

    // Fetch current deal
    const { data: deal, error: fetchErr } = await admin
      .from("market_deals")
      .select("id, status, vehicle_id, seller_tenant_id")
      .eq("id", dealId)
      .eq("seller_tenant_id", caller.tenantId)
      .single();

    if (fetchErr || !deal) {
      return apiNotFound("deal_not_found");
    }

    // Validate status transition
    const allowed = VALID_TRANSITIONS[deal.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return apiValidationError(`Cannot transition from ${deal.status} to ${newStatus}`);
    }

    // Update deal
    const updates: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };
    if (body.agreed_price !== undefined) updates.agreed_price = body.agreed_price;
    if (body.note !== undefined) updates.note = body.note;

    // Scope the UPDATE by seller_tenant_id so no race between the
    // select above and the write can touch another tenant's deal.
    const { data: updatedDeal, error: updateErr } = await admin
      .from("market_deals")
      .update(updates)
      .eq("id", dealId)
      .eq("seller_tenant_id", caller.tenantId)
      .select(
        "id, inquiry_id, vehicle_id, seller_tenant_id, buyer_name, buyer_email, buyer_company, agreed_price, note, status, updated_at",
      )
      .single();

    if (updateErr) {
      return apiInternalError(updateErr, "market-deals update");
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
    type DealWithRelations = {
      buyer_email: string | null;
      buyer_name: string | null;
      vehicle_id: string | null;
      seller_tenant_id: string;
      market_vehicles: {
        maker: string | null;
        model: string | null;
        tenants: { name: string | null; contact_email: string | null } | null;
      } | null;
    };
    try {
      const { data: fullDeal } = await admin
        .from("market_deals")
        .select(
          "buyer_email, buyer_name, vehicle_id, seller_tenant_id, market_vehicles(maker, model, tenants(name, contact_email))",
        )
        .eq("id", dealId)
        .single<DealWithRelations>();
      const vehicle = fullDeal?.market_vehicles;
      const sellerName = vehicle?.tenants?.name ?? "出品者";
      const sellerEmail = vehicle?.tenants?.contact_email;
      const buyerEmail = fullDeal?.buyer_email;
      const buyerName = fullDeal?.buyer_name ?? "購入者";
      const vehicleLabel = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ") || "車両";

      if (buyerEmail) {
        notifyDealStatusChanged(buyerEmail, { vehicleLabel, newStatus, otherPartyName: sellerName }).catch((e) =>
          console.warn("[market] notifyDealStatusChanged (buyer) failed:", e),
        );
      }
      if (sellerEmail) {
        notifyDealStatusChanged(sellerEmail, { vehicleLabel, newStatus, otherPartyName: buyerName }).catch((e) =>
          console.warn("[market] notifyDealStatusChanged (seller) failed:", e),
        );
      }
    } catch (e) {
      console.warn("[market] deal status notification failed:", e);
    }

    return NextResponse.json({ ok: true, deal: updatedDeal });
  } catch (e: unknown) {
    return apiInternalError(e, "market-deals update");
  }
}
