import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const { data: invoices } = await supabase
      .from("agent_invoices")
      .select("id, invoice_number, period_start, period_end, subtotal, tax_rate, tax_amount, total, status, issued_at, paid_at, notes, created_at")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ invoices: invoices ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
