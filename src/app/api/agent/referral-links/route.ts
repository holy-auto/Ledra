import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

    const { data: links } = await supabase
      .from("agent_referral_links")
      .select("id, agent_id, code, label, url, click_count, created_by, created_at, updated_at")
      .eq("agent_id", agent.agent_id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ links: links ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent/referral-links GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return apiUnauthorized();

    const { data: agentData } = await supabase.rpc("get_my_agent_status");
    const agent = Array.isArray(agentData) ? agentData[0] : agentData;
    if (!agent?.agent_id) return apiForbidden("agent_not_found");

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
      .select("id, agent_id, code, label, url, click_count, created_by, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "agent/referral-links insert");
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent/referral-links POST");
  }
}
