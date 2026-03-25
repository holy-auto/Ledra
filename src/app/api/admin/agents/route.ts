import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const status = request.nextUrl.searchParams.get("status");

    let query = admin
      .from("agents")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: agents, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with referral/commission stats
    const enriched = await Promise.all(
      (agents ?? []).map(async (agent) => {
        const [refResult, contractedResult, commResult] = await Promise.all([
          admin
            .from("agent_referrals")
            .select("*", { count: "exact", head: true })
            .eq("agent_id", agent.id),
          admin
            .from("agent_referrals")
            .select("*", { count: "exact", head: true })
            .eq("agent_id", agent.id)
            .eq("status", "contracted"),
          admin
            .from("agent_commissions")
            .select("amount")
            .eq("agent_id", agent.id)
            .in("status", ["approved", "paid"]),
        ]);

        const totalCommission = (commResult.data ?? []).reduce(
          (sum, c) => sum + (c.amount ?? 0),
          0
        );

        return {
          ...agent,
          referral_count: refResult.count ?? 0,
          contracted_count: contractedResult.count ?? 0,
          total_commission: totalCommission,
        };
      })
    );

    return NextResponse.json({ agents: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, contact_name, contact_email, contact_phone, address } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agents")
      .insert({
        name,
        contact_name: contact_name || null,
        contact_email: contact_email || null,
        contact_phone: contact_phone || null,
        address: address || null,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 }
    );
  }
}
