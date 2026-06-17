import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentSupportMessageCreateSchema } from "@/lib/validations/agent-portal";
import type { SupabaseClient } from "@supabase/supabase-js";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Verify the caller's agent owns the support ticket.
 *
 * RLS already restricts agent_ticket_messages to the caller's tickets, but
 * this explicit object-level check is defense-in-depth: it keeps the route
 * safe even if the RLS policy ever regresses, matching the explicit-filter
 * convention used across the other /api/agent routes.
 *
 * Returns the resolved agent_id on success, or an error Response to return.
 */
async function requireTicketOwner(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  ticketId: string,
): Promise<{ ok: true; agentId: string } | { ok: false; response: ReturnType<typeof apiForbidden> }> {
  const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
  const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
  if (!agentRow?.agent_id) {
    return { ok: false, response: apiForbidden("not_agent") };
  }
  const { data: ticket } = await supabase
    .from("agent_support_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("agent_id", agentRow.agent_id)
    .maybeSingle();
  if (!ticket) {
    return { ok: false, response: apiNotFound("ticket_not_found") };
  }
  return { ok: true, agentId: agentRow.agent_id };
}

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const owner = await requireTicketOwner(supabase, id);
    if (!owner.ok) return owner.response;

    const { data: messages } = await supabase
      .from("agent_ticket_messages")
      .select("id, ticket_id, sender_id, is_admin, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    return apiJson({ messages: messages ?? [] });
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

    const owner = await requireTicketOwner(supabase, id);
    if (!owner.ok) return owner.response;

    const parsed = await parseJsonBody(request, agentSupportMessageCreateSchema);
    if (!parsed.ok) return parsed.response;
    const { body: text } = parsed.data;

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
    await supabase.from("agent_support_tickets").update({ status: "awaiting_reply" }).eq("id", id);

    return apiJson({ message: msg }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent/support/[id]/messages POST");
  }
}
