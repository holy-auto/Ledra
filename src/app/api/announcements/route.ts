import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { apiInternalError } from "@/lib/api/response";

// GET: Fetch published announcements (with read status)
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;

    // Fetch published, non-expired announcements
    const { data: announcements, error } = await supabase
      .from("announcements")
      .select("id, title, body, category, published_at, created_at")
      .eq("published", true)
      .or("expires_at.is.null,expires_at.gt.now()")
      .order("published_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    // Fetch read status for current user
    let readIds: Set<string> = new Set();
    if (userId) {
      const { data: reads } = await supabase
        .from("announcement_reads")
        .select("announcement_id")
        .eq("user_id", userId);
      if (reads) {
        readIds = new Set(reads.map((r: { announcement_id: string }) => r.announcement_id));
      }
    }

    const result = (announcements ?? []).map((a) => ({
      ...a,
      is_read: readIds.has(a.id),
    }));

    const unreadCount = result.filter((a) => !a.is_read).length;

    return NextResponse.json({ announcements: result, unread_count: unreadCount });
  } catch (e: unknown) {
    return apiInternalError(e, "announcements");
  }
}
