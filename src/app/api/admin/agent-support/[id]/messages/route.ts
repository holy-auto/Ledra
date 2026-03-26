import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError, apiNotFound } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: RouteContext) {
  const limited = await checkRateLimit(request, "general");
  if (limited) return limited;

  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return apiValidationError("message is required");
    }

    const admin = getAdminClient();

    // Verify ticket exists
    const { data: ticket, error: ticketError } = await admin
      .from("agent_support_tickets")
      .select("id")
      .eq("id", id)
      .single();

    if (ticketError || !ticket) {
      return apiNotFound("ticket not found");
    }

    // Insert admin message
    const { data: msg, error: msgError } = await admin
      .from("agent_ticket_messages")
      .insert({
        ticket_id: id,
        sender_id: caller.userId,
        is_admin: true,
        body: message.trim(),
      })
      .select()
      .single();

    if (msgError) {
      return apiInternalError(msgError, "agent-support message insert");
    }

    // Auto-update ticket status to in_progress
    await admin
      .from("agent_support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ message: msg }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-support message POST");
  }
}
