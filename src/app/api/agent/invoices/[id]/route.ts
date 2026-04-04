import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const [invoiceRes, linesRes, agentRes] = await Promise.all([
      supabase
        .from("agent_invoices")
        .select("id, agent_id, invoice_number, amount, tax, total, status, period_start, period_end, issued_at, paid_at, created_at, updated_at")
        .eq("id", id)
        .eq("agent_id", agent.agent_id)
        .single(),
      supabase
        .from("agent_invoice_lines")
        .select("id, invoice_id, description, quantity, unit_price, amount, created_at")
        .eq("invoice_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("agents")
        .select("name, contact_name, contact_email, address")
        .eq("id", agent.agent_id)
        .single(),
    ]);

    if (!invoiceRes.data) {
      return apiNotFound("invoice_not_found");
    }

    return NextResponse.json({
      invoice: invoiceRes.data,
      lines: linesRes.data ?? [],
      agent: agentRes.data,
    });
  } catch (e) {
    return apiInternalError(e, "agent/invoices/[id] GET");
  }
}
