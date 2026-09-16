import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import {
  apiJson,
  apiForbidden,
  apiInternalError,
  apiValidationError,
  apiNotFound,
} from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";

export const POST = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = await req.json();
    const { message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return apiValidationError("message is required");
    }

    const admin = createPlatformScopedAdmin(
      "agent-support/[id]/messages — platform-wide agent operations (no tenant scope)",
    );

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
      .select("id, ticket_id, sender_id, is_admin, body, created_at")
      .single();

    if (msgError) {
      return apiInternalError(msgError, "agent-support message insert");
    }

    // Auto-update ticket status to in_progress
    await admin
      .from("agent_support_tickets")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", id);

    return apiJson({ message: msg }, { status: 201 });
  },
  { routeName: "agent-support/[id]/messages POST" },
);
