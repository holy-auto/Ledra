import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentTrainingUpdateSchema } from "@/lib/validations/agent-content";
import { withCaller } from "@/lib/api/withCaller";

export const PUT = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(req, agentTrainingUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const admin = createPlatformScopedAdmin("agent-training/[id] — platform-wide agent operations (no tenant scope)");

    const { data, error } = await admin
      .from("agent_training_courses")
      .update(updates)
      .eq("id", id)
      .select(
        "id, title, description, category, content_type, content_url, thumbnail_url, duration_min, is_required, is_published, sort_order, created_at, updated_at",
      )
      .single();
    if (error) return apiInternalError(error, "agent-training PUT");
    return apiJson({ course: data });
  },
  { routeName: "agent-training/[id] PUT" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_req, { caller, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-training/[id] — platform-wide agent operations (no tenant scope)");
    await admin.from("agent_training_courses").delete().eq("id", id);
    return apiJson({ ok: true });
  },
  { routeName: "agent-training/[id] DELETE" },
);
