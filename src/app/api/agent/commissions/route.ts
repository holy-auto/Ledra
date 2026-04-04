import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: List agent commissions with period filters and summary ───
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    const url = new URL(request.url);
    const periodFrom = url.searchParams.get("period_from");
    const periodTo = url.searchParams.get("period_to");

    // Query commissions joined with referrals for shop_name
    let query = supabase
      .from("agent_commissions")
      .select("id, agent_id, referral_id, amount, rate, status, period_start, period_end, paid_at, notes, created_at, updated_at, agent_referrals(shop_name)")
      .eq("agent_id", agentId)
      .order("period_start", { ascending: false });

    if (periodFrom) {
      query = query.gte("period_start", periodFrom);
    }
    if (periodTo) {
      query = query.lte("period_end", periodTo);
    }

    const { data: commissions, error } = await query;

    if (error) {
      return apiInternalError(error, "agent/commissions query");
    }

    const rows = (commissions ?? []).map((c: Record<string, unknown>) => {
      const ref = c.agent_referrals as Record<string, unknown> | null;
      return {
        ...c,
        shop_name: ref?.shop_name ?? null,
        agent_referrals: undefined,
      };
    });

    // Compute summary from all commissions for this agent (not filtered)
    const { data: allCommissions, error: summaryErr } = await supabase
      .from("agent_commissions")
      .select("amount, status, period_start")
      .eq("agent_id", agentId);

    if (summaryErr) {
      return apiInternalError(summaryErr, "agent/commissions summary");
    }

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    let totalEarned = 0;
    let totalPending = 0;
    let thisMonth = 0;

    for (const c of allCommissions ?? []) {
      const amount = (c.amount as number) ?? 0;
      const status = c.status as string;
      const periodStart = c.period_start as string;

      if (status === "approved" || status === "paid") {
        totalEarned += amount;
      }
      if (status === "pending") {
        totalPending += amount;
      }
      if (
        (status === "pending" || status === "approved" || status === "paid") &&
        periodStart >= thisMonthStart
      ) {
        thisMonth += amount;
      }
    }

    return NextResponse.json({
      commissions: rows,
      summary: {
        total_earned: totalEarned,
        total_pending: totalPending,
        this_month: thisMonth,
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/commissions GET");
  }
}
