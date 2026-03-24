import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: messages } = await supabase
      .from("agent_ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ messages: messages ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const text = ((body.body as string) ?? "").trim();
    if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const { data: msg, error } = await supabase
      .from("agent_ticket_messages")
      .insert({
        ticket_id: id,
        sender_id: auth.user.id,
        is_admin: false,
        body: text,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Update ticket status
    await supabase
      .from("agent_support_tickets")
      .update({ status: "awaiting_reply" })
      .eq("id", id);

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
