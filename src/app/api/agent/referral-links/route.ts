import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const { data: links } = await supabase
      .from("agent_referral_links")
      .select("id, code, label, url, click_count, is_active, created_at")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ links: links ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return NextResponse.json({ error: "agent_not_found" }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const label = ((body.label as string) ?? "").trim();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://ledra.co.jp";
    const code = `AL-${agent.agent_id.substring(0, 4).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    const url = `${baseUrl}/ref/${code}`;

    const { data: link, error } = await supabase
      .from("agent_referral_links")
      .insert({
        agent_id: agent.agent_id,
        code,
        label: label || null,
        url,
        created_by: auth.user.id,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "internal_error" }, { status: 500 });
  }
}
