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

    const { data: invoices } = await supabase
      .from("agent_invoices")
      .select("id, agent_id, invoice_number, amount, tax, total, status, period_start, period_end, issued_at, paid_at, created_at, updated_at")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ invoices: invoices ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent/invoices GET");
  }
}
