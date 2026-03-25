import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// ─── POST: Mark an agent announcement as read ───
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Verify the user is an agent user
    const { data: agentData, error: agentErr } = await supabase.rpc("get_my_agent_status");
    if (agentErr || !agentData || (Array.isArray(agentData) && agentData.length === 0)) {
      return NextResponse.json({ error: "agent_not_found" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const announcementId = ((body?.announcement_id as string) ?? "").trim();

    if (!announcementId) {
      return NextResponse.json(
        { error: "announcement_id_required", message: "announcement_id は必須です。" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("agent_announcement_reads")
      .upsert(
        { announcement_id: announcementId, user_id: auth.user.id },
        { onConflict: "announcement_id,user_id" }
      );

    if (error) {
      console.error("[agent/announcements/read] upsert error:", error.message);
      return NextResponse.json({ error: "db_error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("[agent/announcements/read] POST error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
