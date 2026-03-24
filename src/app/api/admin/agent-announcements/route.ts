import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ announcements: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json();
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("agent_announcements")
      .insert({
        title: body.title,
        body: body.body,
        category: body.category ?? "general",
        is_pinned: body.is_pinned ?? false,
        published_at: body.published_at ?? new Date().toISOString(),
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ announcement: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
