import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: campaigns }, { data: upcoming }, { data: past }] = await Promise.all([
      supabase
        .from("agent_campaigns")
        .select("id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, banner_text")
        .eq("is_active", true)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("end_date", { ascending: true }),
      supabase
        .from("agent_campaigns")
        .select("id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, banner_text")
        .eq("is_active", true)
        .gt("start_date", today)
        .order("start_date", { ascending: true })
        .limit(5),
      supabase
        .from("agent_campaigns")
        .select("id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, banner_text")
        .lt("end_date", today)
        .order("end_date", { ascending: false })
        .limit(10),
    ]);

    const res = NextResponse.json({
      active: campaigns ?? [],
      upcoming: upcoming ?? [],
      past: past ?? [],
    });
    res.headers.set("Cache-Control", "private, max-age=300, stale-while-revalidate=600");
    return res;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
