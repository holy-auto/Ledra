import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();

    const { data: ticket, error } = await admin
      .from("agent_support_tickets")
      .select("*, agents:agent_id(id, name)")
      .eq("id", id)
      .single();

    if (error) {
      return apiInternalError(error, "agent-support [id] GET ticket");
    }

    const { data: messages, error: msgError } = await admin
      .from("agent_ticket_messages")
      .select("id, ticket_id, sender_id, is_admin, body, created_at")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });

    if (msgError) {
      return apiInternalError(msgError, "agent-support [id] GET messages");
    }

    return NextResponse.json({ ticket, messages: messages ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-support [id] GET");
  }
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();
    const allowed = ["status", "priority"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("no valid fields");
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("agent_support_tickets")
      .update(updates)
      .eq("id", id)
      .select("id, agent_id, subject, status, priority, created_at, updated_at")
      .single();

    if (error) {
      return apiInternalError(error, "agent-support [id] PUT");
    }

    return NextResponse.json({ ticket: data });
  } catch (e) {
    return apiInternalError(e, "agent-support [id] PUT");
  }
}
