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
      .from("agent_notifications")
      .select("*, agents(name)")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const notifications = (data ?? []).map((n: any) => ({
      ...n,
      agent_name: n.agents?.name ?? "",
      agents: undefined,
    }));

    return NextResponse.json({ notifications });
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
      .from("agent_notifications")
      .insert({
        agent_id: body.agent_id,
        user_id: auth.user.id,
        type: body.type ?? "info",
        title: body.title,
        body: body.body,
        link: body.link || null,
        is_read: false,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ notification: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
