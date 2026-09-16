import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentCampaignUpdateSchema } from "@/lib/validations/agent-content";

export const PUT = withCaller<{ id: string }>(
  async (request: NextRequest, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentCampaignUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const admin = createPlatformScopedAdmin("agent-campaigns/[id] — platform-wide agent operations (no tenant scope)");

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
  },
  { routeName: "agent-campaigns/[id] PUT" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_request: NextRequest, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-campaigns/[id] — platform-wide agent operations (no tenant scope)");
    await admin.from("agent_campaigns").delete().eq("id", id);
    return apiJson({ ok: true });
  },
  { routeName: "agent-campaigns/[id] DELETE" },
);
