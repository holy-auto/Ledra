import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentFaqUpdateSchema } from "@/lib/validations/agent-content";
import { withCaller } from "@/lib/api/withCaller";

export const PUT = withCaller<{ id: string }>(
  async (request, { caller, supabase, params }) => {
    const { id } = params;
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
  },
  { routeName: "admin/agent-faq/[id] PUT" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_request, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-faq/[id] — platform-wide agent operations (no tenant scope)");
    await admin.from("agent_faqs").delete().eq("id", id);
    return apiJson({ ok: true });
  },
  { routeName: "admin/agent-faq/[id] DELETE" },
);
