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
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerTenant(supabase);
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
      return NextResponse.json({ error: "update_failed", detail: updateErr.message }, { status: 500 });
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

    return NextResponse.json({ ok: true, deal: updatedDeal });
  } catch (e: any) {
    console.error("market deal update failed", e);
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
