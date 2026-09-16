import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentCampaignCreateSchema } from "@/lib/validations/agent-content";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-campaigns — platform-wide agent operations (no tenant scope)");
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let query = admin
      .from("agent_campaigns")
      .select(
        "id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, is_active, banner_text, target_agents, created_at, updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (p.page > 0) query = query.range(p.from, p.to);
    else query = query.limit(p.perPage);

    const { data, count } = await query;

    return apiJson({
      campaigns: data ?? [],
      page: p.page,
      per_page: p.perPage,
      total: count ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentCampaignCreateSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const admin = createPlatformScopedAdmin("agent-campaigns — platform-wide agent operations (no tenant scope)");

    const { data, error } = await admin
      .from("agent_campaigns")
      .insert({
        title: body.title,
        description: body.description ?? null,
        campaign_type: body.campaign_type ?? "commission_boost",
        bonus_rate: body.bonus_rate ?? null,
        bonus_fixed: body.bonus_fixed ?? null,
        start_date: body.start_date,
        end_date: body.end_date,
        banner_text: body.banner_text ?? null,
        target_agents: body.target_agents ?? "all",
      })
      .select(
        "id, title, description, campaign_type, bonus_rate, bonus_fixed, start_date, end_date, is_active, banner_text, target_agents, created_at, updated_at",
      )
      .single();

    if (error) return apiInternalError(error, "agent-campaigns POST");
    return apiJson({ campaign: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-campaigns");
  }
}
