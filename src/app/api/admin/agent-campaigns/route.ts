import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    const { data } = await admin
      .from("agent_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    return NextResponse.json({ campaigns: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();

    const { data, error } = await admin
      .from("agent_campaigns")
      .insert({
        title: body.title,
        description: body.description || null,
        campaign_type: body.campaign_type ?? "commission_boost",
        bonus_rate: body.bonus_rate || null,
        bonus_fixed: body.bonus_fixed || null,
        start_date: body.start_date,
        end_date: body.end_date,
        banner_text: body.banner_text || null,
        target_agents: body.target_agents ?? "all",
      })
      .select()
      .single();

    if (error) return apiInternalError(error, "agent-campaigns POST");
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns");
  }
}
