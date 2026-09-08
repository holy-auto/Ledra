import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentFaqUpdateSchema } from "@/lib/validations/agent-content";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentFaqUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const admin = createPlatformScopedAdmin("agent-faq/[id] — platform-wide agent operations (no tenant scope)");

    const { data, error } = await admin
      .from("agent_faqs")
      .update(updates)
      .eq("id", id)
      .select("id, category_id, question, answer, sort_order, is_published, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "agent-faq PUT");
    return apiJson({ faq: data });
  } catch (e) {
    return apiInternalError(e, "agent-faq PUT");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-faq/[id] — platform-wide agent operations (no tenant scope)");
    await admin.from("agent_faqs").delete().eq("id", id);
    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-faq DELETE");
  }
}
