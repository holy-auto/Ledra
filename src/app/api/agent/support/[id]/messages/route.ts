import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: messages } = await supabase
      .from("agent_ticket_messages")
      .select("id, ticket_id, sender_id, is_admin, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({ messages: messages ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent/support/[id]/messages GET");
  }
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const body = await request.json().catch(() => ({}));
    const text = ((body.body as string) ?? "").trim();
    if (!text) return apiValidationError("body is required");

    const { data: msg, error } = await supabase
      .from("agent_ticket_messages")
      .insert({
        ticket_id: id,
        sender_id: auth.user.id,
        is_admin: false,
        body: text,
      })
      .select("id, ticket_id, sender_id, is_admin, body, created_at")
      .single();

    if (error) return apiInternalError(error, "agent/support/[id]/messages insert");

    // Update ticket status
    await supabase
      .from("agent_support_tickets")
      .update({ status: "awaiting_reply" })
      .eq("id", id);

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent/support/[id]/messages POST");
  }
}
