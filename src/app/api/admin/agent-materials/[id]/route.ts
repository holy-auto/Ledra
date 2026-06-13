import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
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
    const { admin } = createTenantScopedAdmin(caller.tenantId);

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

export async function PATCH(request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return apiValidationError("file is required");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch current record to get old storage_path
    const { data: current } = await admin.from("agent_materials").select("id, storage_path").eq("id", id).single();

    if (!current) return apiInternalError(new Error("not found"), "agent-materials PATCH");

    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `materials/${timestamp}_${safeName}`;

    const { error: uploadErr } = await admin.storage.from("agent-materials").upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

    if (uploadErr) return apiInternalError(uploadErr, "agent-materials PATCH upload");

    // Remove old file if it was a demo placeholder path (best-effort)
    if (current.storage_path && current.storage_path !== storagePath) {
      await admin.storage
        .from("agent-materials")
        .remove([current.storage_path])
        .catch(() => {});
    }

    const { data, error } = await admin
      .from("agent_materials")
      .update({
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        storage_path: storagePath,
      })
      .eq("id", id)
      .select("id, file_name, file_size, file_type, storage_path")
      .single();

    if (error) return apiInternalError(error, "agent-materials PATCH update");

    return apiJson({ material: data });
  } catch (e) {
    return apiInternalError(e, "agent-materials PATCH");
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
