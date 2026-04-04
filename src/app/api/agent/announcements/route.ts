import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── GET: Fetch published agent announcements with read status ───
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    // Verify the user is an agent user
    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("agent_not_found");
    }

    // Fetch published announcements (RLS ensures only published_at <= now())
    const { data: announcements, error } = await supabase
      .from("agent_announcements")
      .select("id, title, body, category, is_pinned, published_at, created_at")
      .not("published_at", "is", null)
      .lte("published_at", new Date().toISOString())
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false });

    if (error) {
      return apiInternalError(error, "agent/announcements");
    }

    // Fetch read status for current user
    const { data: reads } = await supabase
      .from("agent_announcement_reads")
      .select("announcement_id")
      .eq("user_id", auth.user.id);

    const readIds = new Set(
      (reads ?? []).map((r: { announcement_id: string }) => r.announcement_id)
    );

    const result = (announcements ?? []).map((a) => ({
      ...a,
      is_read: readIds.has(a.id),
    }));

    const unreadCount = result.filter((a) => !a.is_read).length;

    return NextResponse.json({
      announcements: result,
      unread_count: unreadCount,
    });
  } catch (e: unknown) {
    return apiInternalError(e, "agent/announcements GET");
  }
}
