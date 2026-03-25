import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await admin
      .from("agent_support_tickets")
      .select("id")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({ error: "ticket not found" }, { status: 404 });
    }

    // Insert admin message
    const { data: msg, error: msgError } = await admin
      .from("agent_ticket_messages")
      .insert({
        ticket_id: id,
        sender_id: auth.user.id,
        is_admin: true,
        body: message.trim(),
      })
      .select()
      .single();

    if (msgError) {
      return NextResponse.json({ error: msgError.message }, { status: 500 });
    }

    // Auto-update ticket status to in_progress
    await admin
      .from("agent_support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "internal_error" },
      { status: 500 },
    );
  }
}
