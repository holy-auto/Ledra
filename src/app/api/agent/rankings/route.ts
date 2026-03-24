import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "month";

    const { data: rankings } = await supabase.rpc("agent_rankings", { p_period: period });

    // Anonymize: replace names with "代理店A", "代理店B", etc. except own
    const items = (rankings ?? []).map((r: any, i: number) => ({
      rank: i + 1,
      agent_name: r.agent_id === agent.agent_id ? r.agent_name : `代理店${String.fromCharCode(65 + (i % 26))}`,
      is_self: r.agent_id === agent.agent_id,
      referral_count: r.referral_count,
      contracted_count: r.contracted_count,
      conversion_rate: r.conversion_rate,
      total_commission: r.agent_id === agent.agent_id ? r.total_commission : null,
    }));

    // Find own rank
    const selfRank = items.find((r: any) => r.is_self);

    return NextResponse.json({ rankings: items, self_rank: selfRank ?? null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
