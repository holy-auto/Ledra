import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { notifySlack } from "@/lib/slack";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const { data: tickets } = await supabase
      .from("agent_support_tickets")
      .select("id, agent_id, user_id, subject, category, priority, status, created_at, updated_at")
      .eq("agent_id", agent.agent_id)
      .order("updated_at", { ascending: false });

    return NextResponse.json({ tickets: tickets ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent/support GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const body = await request.json().catch(() => ({}));
    const subject = ((body.subject as string) ?? "").trim();
    const category = body.category ?? "general";
    const priority = body.priority ?? "normal";
    const message = ((body.message as string) ?? "").trim();

    if (!subject || !message) {
      return apiValidationError("subject and message are required");
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
      .select("id, agent_id, user_id, subject, category, priority, status, created_at, updated_at")
      .single();

    if (ticketErr) return apiInternalError(ticketErr, "agent/support ticket insert");

    // Add initial message
    await supabase.from("agent_ticket_messages").insert({
      ticket_id: ticket.id,
      sender_id: auth.user.id,
      is_admin: false,
      body: message,
    });

    try {
      await notifySlack(process.env.SLACK_AGENT_SUPPORT_WEBHOOK_URL, {
        text: `:ticket: 代理店サポート新規チケット: *${subject}*`,
        fields: [
          { title: "件名", value: subject },
          { title: "種別", value: String(category), short: true },
          { title: "優先度", value: String(priority), short: true },
          { title: "代理店ID", value: String(agent.agent_id), short: true },
          { title: "チケットID", value: String(ticket.id), short: true },
          { title: "本文", value: message.slice(0, 500) },
        ],
      });
    } catch (err) {
      console.error("[agent/support] slack notify failed:", err);
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent/support POST");
  }
}
