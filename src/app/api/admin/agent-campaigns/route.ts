import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data } = await admin
      .from("agent_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    return NextResponse.json({ campaigns: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json();
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("agent_campaigns")
      .insert({
        title: body.title,
        description: body.description || null,
        campaign_type: body.campaign_type ?? "commission_boost",
        bonus_rate: body.bonus_rate || null,
        bonus_fixed: body.bonus_fixed || null,
        start_date: body.start_date,
        end_date: body.end_date,
        banner_text: body.banner_text || null,
        target_agents: body.target_agents ?? "all",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
