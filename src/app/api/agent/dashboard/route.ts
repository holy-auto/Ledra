import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: Agent dashboard stats ───
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    // Resolve agent context
    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("代理店情報が見つかりません。");
    }

    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    const agentId = agent.agent_id as string;

    // Fetch dashboard stats via RPC
    const { data: stats, error: statsErr } = await supabase.rpc("agent_dashboard_stats", {
      p_agent_id: agentId,
    });

    if (statsErr) return apiInternalError(statsErr, "agent/dashboard rpc");

    // Flatten stats and map field names to match DashboardData type
    const s = ((Array.isArray(stats) ? stats[0] : stats) as Record<string, unknown>) ?? {};
    return apiJson({
      agent_name: agent.agent_name,
      agent_status: agent.status,
      role: agent.role,
      total_referrals: s.total_referrals ?? 0,
      contracted_referrals: s.contracted_referrals ?? 0,
      this_month_commission: s.this_month_commissions ?? 0,
      total_commission: s.total_commission_amount ?? 0,
      conversion_rate: ((s.conversion_rate as number) ?? 0) / 100,
      unread_announcements: s.unread_announcements ?? 0,
      recent_referrals: (Array.isArray(s.recent_referrals) ? s.recent_referrals : []).map(
        (r: Record<string, unknown>) => ({
          id: r.id ?? "",
          shop_name: r.shop_name ?? "",
          contact_name: r.contact_name ?? "",
          status: r.status ?? "",
          created_at: r.created_at ?? "",
        }),
      ),
      monthly_commissions: (Array.isArray(s.monthly_commissions) ? s.monthly_commissions : []).map(
        (m: Record<string, unknown>) => ({
          month: m.month ?? "",
          total_amount: (m.total as number) ?? 0,
        }),
      ),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/dashboard GET");
  }
}
