import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { withCaller } from "@/lib/api/withCaller";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentAnnouncementUpdateSchema } from "@/lib/validations/agent-content";

export const PUT = withCaller<{ id: string }>(
  async (request: NextRequest, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentAnnouncementUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const admin = createPlatformScopedAdmin(
      "agent-announcements/[id] — platform-wide agent operations (no tenant scope)",
    );

    const { data, error } = await admin
      .from("agent_announcements")
      .update(updates)
      .eq("id", id)
      .select("id, title, body, category, is_pinned, published_at, created_by, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error, "agent-announcements PUT");
    return apiJson({ announcement: data });
  },
  { routeName: "agent-announcements/[id] PUT" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_request: NextRequest, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin(
      "agent-announcements/[id] — platform-wide agent operations (no tenant scope)",
    );
    await admin.from("agent_announcements").delete().eq("id", id);
    return apiJson({ ok: true });
  },
  { routeName: "agent-announcements/[id] DELETE" },
);
