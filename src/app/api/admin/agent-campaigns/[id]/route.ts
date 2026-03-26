import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = await request.json();
    const admin = getAdminClient();
    const allowed = ["title", "description", "campaign_type", "bonus_rate", "bonus_fixed", "start_date", "end_date", "is_active", "banner_text", "target_agents"];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await admin.from("agent_campaigns").update(updates).eq("id", id).select().single();
    if (error) return apiInternalError(error, "agent-campaigns PUT");
    return NextResponse.json({ campaign: data });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns PUT");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const admin = getAdminClient();
    await admin.from("agent_campaigns").delete().eq("id", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns DELETE");
  }
}
