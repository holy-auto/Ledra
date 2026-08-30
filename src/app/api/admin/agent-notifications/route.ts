import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { parsePagination } from "@/lib/api/pagination";
import { agentNotificationCreateSchema } from "@/lib/validations/agent-content";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const p = parsePagination(request, { defaultPerPage: 50, maxPerPage: 200 });

    let query = admin
      .from("agent_notifications")
      .select("id, agent_id, user_id, type, title, body, link, is_read, created_at, agents(name)", {
        count: "exact",
      })
      .order("created_at", { ascending: false });

    if (p.page > 0) query = query.range(p.from, p.to);
    else query = query.limit(p.perPage);

    const { data, error, count } = await query;

    if (error) return apiInternalError(error, "agent-notifications");

    const notifications = (data ?? []).map((n: any) => ({
      ...n,
      agent_name: n.agents?.name ?? "",
      agents: undefined,
    }));

    return apiJson({
      notifications,
      page: p.page,
      per_page: p.perPage,
      total: count ?? null,
    });
  } catch (e) {
    return apiInternalError(e, "agent-notifications");
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const parsed = await parseJsonBody(request, agentNotificationCreateSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data, error } = await admin
      .from("agent_notifications")
      .insert({
        agent_id: body.agent_id,
        user_id: caller.userId,
        type: body.type ?? "info",
        title: body.title,
        body: body.body,
        link: body.link ?? null,
        is_read: false,
      })
      .select("id, agent_id, user_id, type, title, body, link, is_read, created_at")
      .single();

    if (error) return apiInternalError(error, "agent-notifications");
    return apiJson({ notification: data }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "agent-notifications");
  }
}
