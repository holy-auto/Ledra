import { NextRequest, NextResponse } from "next/server";
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

    const { data: tickets } = await supabase
      .from("agent_support_tickets")
      .select("id, subject, category, status, priority, created_at, updated_at")
      .eq("agent_id", agent.agent_id)
      .order("updated_at", { ascending: false });

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const subject = ((body.subject as string) ?? "").trim();
    const category = body.category ?? "general";
    const priority = body.priority ?? "normal";
    const message = ((body.message as string) ?? "").trim();

    if (!subject || !message) {
      return NextResponse.json({ error: "subject and message are required" }, { status: 400 });
    }

    // Create ticket
    const { data: ticket, error: ticketErr } = await supabase
      .from("agent_support_tickets")
      .insert({
        agent_id: agent.agent_id,
        user_id: auth.user.id,
        subject,
        category,
        priority,
      })
      .select()
      .single();

    if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 });

    // Add initial message
    await supabase.from("agent_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: auth.user.id,
      is_admin: false,
      body: message,
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
