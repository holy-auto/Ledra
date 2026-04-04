import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const today = new Date().toISOString().slice(0, 10);

    const campaignColumns = "id, title, description, start_date, end_date, is_active, reward_type, reward_value, target_referrals, created_at, updated_at";

    const { data: campaigns } = await supabase
      .from("agent_campaigns")
      .select(campaignColumns)
      .eq("is_active", true)
      .lte("start_date", today)
      .gte("end_date", today)
      .order("end_date", { ascending: true });

    // Also get upcoming campaigns
    const { data: upcoming } = await supabase
      .from("agent_campaigns")
      .select(campaignColumns)
      .eq("is_active", true)
      .gt("start_date", today)
      .order("start_date", { ascending: true })
      .limit(5);

    // Past campaigns
    const { data: past } = await supabase
      .from("agent_campaigns")
      .select(campaignColumns)
      .lt("end_date", today)
      .order("end_date", { ascending: false })
      .limit(10);

    return NextResponse.json({
      active: campaigns ?? [],
      upcoming: upcoming ?? [],
      past: past ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "agent/campaigns GET");
  }
}
