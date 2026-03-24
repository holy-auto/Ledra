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

    const agentId = agent.agent_id as string;
    const url = new URL(request.url);
    const months = Math.min(24, Math.max(3, parseInt(url.searchParams.get("months") ?? "12", 10)));

    // Get referrals with dates
    const { data: referrals } = await supabase
      .from("agent_referrals")
      .select("id, status, created_at, contract_date")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: true });

    // Get commissions
    const { data: commissions } = await supabase
      .from("agent_commissions")
      .select("amount, status, period_start")
      .eq("agent_id", agentId);

    // Build monthly data
    const now = new Date();
    const monthlyData: Array<{
      month: string;
      referrals: number;
      contracted: number;
      commission_earned: number;
      commission_pending: number;
    }> = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const monthRefs = (referrals ?? []).filter((r) => {
        const rd = new Date(r.created_at);
        return rd >= d && rd < nextMonth;
      });

      const monthComms = (commissions ?? []).filter((c) => {
        const ps = c.period_start as string;
        return ps >= monthStr && ps < `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
      });

      monthlyData.push({
        month: monthStr,
        referrals: monthRefs.length,
        contracted: monthRefs.filter((r) => r.status === "contracted").length,
        commission_earned: monthComms
          .filter((c) => c.status === "approved" || c.status === "paid")
          .reduce((s, c) => s + ((c.amount as number) ?? 0), 0),
        commission_pending: monthComms
          .filter((c) => c.status === "pending")
          .reduce((s, c) => s + ((c.amount as number) ?? 0), 0),
      });
    }

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    for (const r of referrals ?? []) {
      statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    }

    // Totals
    const totalReferrals = (referrals ?? []).length;
    const totalContracted = (referrals ?? []).filter((r) => r.status === "contracted").length;
    const conversionRate = totalReferrals > 0 ? Math.round((totalContracted / totalReferrals) * 1000) / 10 : 0;
    const totalEarned = (commissions ?? [])
      .filter((c) => c.status === "approved" || c.status === "paid")
      .reduce((s, c) => s + ((c.amount as number) ?? 0), 0);

    return NextResponse.json({
      monthly: monthlyData,
      status_breakdown: statusCounts,
      totals: {
        referrals: totalReferrals,
        contracted: totalContracted,
        conversion_rate: conversionRate,
        total_earned: totalEarned,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
