import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const url = new URL(request.url);
    const limit = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10));

    const { data: notifications } = await supabase
      .from("agent_notifications")
      .select("id, agent_id, type, title, body, is_read, link, created_at")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length;

    return NextResponse.json({ notifications: notifications ?? [], unread_count: unreadCount });
  } catch (e) {
    return apiInternalError(e, "agent/notifications GET");
  }
}

// Mark notifications as read
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const body = await request.json().catch(() => ({}));
    const ids = body.ids as string[] | undefined;

    let query = supabase
      .from("agent_notifications")
      .update({ is_read: true })
      .eq("agent_id", agent.agent_id);

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    }

    await query;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent/notifications PUT");
  }
}
