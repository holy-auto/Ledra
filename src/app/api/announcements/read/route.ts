import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

// POST: Mark announcement as read
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { announcement_id } = await req.json();
    if (!announcement_id) {
      return NextResponse.json({ error: "announcement_id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("announcement_reads")
      .upsert(
        { announcement_id, user_id: userRes.user.id },
        { onConflict: "announcement_id,user_id" }
      );

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
