import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/admin/agent-shared-files/[id]
 * Admin deletes a shared file.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Fetch file record
    const { data: file, error: fetchErr } = await admin
      .from("agent_shared_files")
      .select("id, storage_path")
      .eq("id", id)
      .single();

    if (fetchErr || !file) return apiNotFound("file not found");

    // Delete from storage
    await admin.storage.from("agent-shared-files").remove([file.storage_path]);

    // Delete DB record
    const { error: deleteErr } = await admin.from("agent_shared_files").delete().eq("id", id);

    if (deleteErr) throw deleteErr;

    return apiJson({ ok: true });
  } catch (e) {
    return apiInternalError(e, "admin/agent-shared-files DELETE");
  }
}
