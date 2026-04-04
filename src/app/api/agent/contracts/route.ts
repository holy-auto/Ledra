import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/contracts
 * List signing requests for the current agent.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) {
      return apiForbidden("not_agent");
    }

    // RLS ensures only own agent's records
    const { data, error } = await supabase
      .from("agent_signing_requests")
      .select("id, agent_id, template_type, title, status, signer_email, signer_name, sent_at, signed_at, created_at, updated_at")
      .eq("agent_id", agentRow.agent_id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ contracts: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent/contracts GET");
  }
}
