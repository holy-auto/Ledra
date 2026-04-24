import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

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

    const updates: Record<string, unknown> = {};
    const allowed = ["title", "description", "category_id", "version", "is_pinned", "is_published"];
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("no fields to update");
    }

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
