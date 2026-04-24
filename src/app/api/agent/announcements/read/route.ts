import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiOk, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

// ─── POST: Mark an agent announcement as read ───
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    // Verify the user is an agent user
    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return apiForbidden("代理店情報が見つかりません。");
    }

    const body = await request.json().catch(() => ({}) as Record<string, unknown>);
    const announcementId = ((body?.announcement_id as string) ?? "").trim();

    if (!announcementId) return apiValidationError("announcement_id は必須です。");

    const { error } = await supabase
      .from("agent_announcement_reads")
      .upsert({ announcement_id: announcementId, user_id: auth.user.id }, { onConflict: "announcement_id,user_id" });

    if (error) return apiInternalError(error, "agent/announcements/read upsert");

    return apiOk({});
  } catch (e: unknown) {
    return apiInternalError(e, "agent/announcements/read POST");
  }
}
