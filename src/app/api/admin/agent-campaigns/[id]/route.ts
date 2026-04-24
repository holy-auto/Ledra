import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const body = await request.json();
    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const allowed = [
      "title",
      "description",
      "campaign_type",
      "bonus_rate",
      "bonus_fixed",
      "start_date",
      "end_date",
      "is_active",
      "banner_text",
      "target_agents",
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await admin
      .from("agent_campaigns")
      .update(updates)
      .eq("id", id)
      .select(
        "id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, is_active, banner_text, target_agents, created_at, updated_at",
      )
      .single();
    if (error) return apiInternalError(error, "agent-campaigns PUT");
    return apiJson({ campaign: data });
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    await admin.from("agent_campaigns").delete().eq("id", id);
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns DELETE");
  }
}
