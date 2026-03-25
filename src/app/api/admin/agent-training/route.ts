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
    const { data } = await admin.from("agent_training_courses").select("*").order("sort_order", { ascending: true });
    return NextResponse.json({ courses: data ?? [] });
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
      .from("agent_training_courses")
      .insert({
        title: body.title,
        description: body.description || null,
        category: body.category ?? "basic",
        content_type: body.content_type ?? "video",
        content_url: body.content_url || null,
        thumbnail_url: body.thumbnail_url || null,
        duration_min: body.duration_min || null,
        is_required: body.is_required ?? false,
        is_published: body.is_published ?? true,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
