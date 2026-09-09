import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { agentMaterialUpdateSchema } from "@/lib/validations/agent-content";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(request, agentMaterialUpdateSchema);
    if (!parsed.ok) return parsed.response;
    const updates = parsed.data;
    const admin = createPlatformScopedAdmin("agent-materials/[id] — platform-wide agent operations (no tenant scope)");

    const { data, error } = await admin
      .from("agent_materials")
      .update(updates)
      .eq("id", id)
      .select(
        "id, category_id, title, description, file_name, file_size, file_type, storage_path, version, is_pinned, is_published, uploaded_by, created_at, updated_at",
      )
      .single();

    if (error) {
      return apiInternalError(error, "agent-materials PUT");
    }

    return apiJson({ material: data });
  } catch (e) {
    return apiInternalError(e, "agent-materials PUT");
  }
}

export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("agent-materials/[id] — platform-wide agent operations (no tenant scope)");

    // Get storage path before deleting
    const { data: material } = await admin.from("agent_materials").select("storage_path").eq("id", id).single();

    if (material?.storage_path) {
      await admin.storage.from("agent-materials").remove([material.storage_path]);
    }

    const { error } = await admin.from("agent_materials").delete().eq("id", id);

    if (error) {
      return apiInternalError(error, "agent-materials DELETE");
    }

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "agent-materials DELETE");
  }
}
