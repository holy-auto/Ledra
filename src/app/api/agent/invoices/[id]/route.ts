import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const [invoiceRes, linesRes, agentRes] = await Promise.all([
      supabase
        .from("agent_invoices")
        .select("*")
        .eq("id", id)
        .eq("agent_id", agent.agent_id)
        .single(),
      supabase
        .from("agent_invoice_lines")
        .select("*")
        .eq("invoice_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("agents")
        .select("name, contact_name, contact_email, address")
        .eq("id", agent.agent_id)
        .single(),
    ]);

    if (!invoiceRes.data) {
      return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      invoice: invoiceRes.data,
      lines: linesRes.data ?? [],
      agent: agentRes.data,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
