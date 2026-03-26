import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const dynamic = "force-dynamic";

// ─── GET: Agent dashboard stats ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Resolve agent context
    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 403 });
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    // Fetch dashboard stats via RPC
    const { data: stats, error: statsErr } = await supabase.rpc("agent_dashboard_stats", {
      p_agent_id: agentId,
    });

    if (statsErr) {
      console.error("[agent/dashboard] rpc error:", statsErr.message);
      return NextResponse.json({ error: "failed_to_fetch_stats" }, { status: 500 });
    }

    return NextResponse.json({
      agent_id: agentId,
      agent_name: agent.agent_name,
      status: agent.status,
      role: agent.role,
      stats: stats ?? {},
    });
  } catch (e: unknown) {
    console.error("[agent/dashboard] error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
