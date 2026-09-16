import { createPlatformScopedAdmin } from "@/lib/supabase/admin";

import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agent-commissions?status=pending
 * Platform-admin list of agent commissions for the payout queue.
 */
export const GET = withCaller(
  async (request, { caller }) => {
    try {
      if (!isPlatformAdmin(caller)) return apiForbidden();

      const status = request.nextUrl.searchParams.get("status");
      const admin = createPlatformScopedAdmin("agent-commissions — platform-wide payout queue");

      let query = admin
        .from("agent_commissions")
        .select(
          "id, agent_id, referral_id, tenant_id, period_start, period_end, base_amount, " +
            "commission_rate, commission_type, amount, currency, status, stripe_transfer_id, paid_at, created_at, " +
            "agents(name, stripe_account_id, stripe_onboarding_done)",
        )
        .order("created_at", { ascending: false })
        .limit(500);

      if (status) query = query.eq("status", status);

      const { data, error } = await query;
      if (error) return apiInternalError(error, "agent-commissions GET");

      return apiJson({ commissions: data ?? [] });
    } catch (e) {
      return apiInternalError(e, "agent-commissions GET");
    }
  },
  { routeName: "agent-commissions GET" },
);
