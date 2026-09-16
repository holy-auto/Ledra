import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiForbidden, apiNotFound } from "@/lib/api/response";
import { withCaller } from "@/lib/api/withCaller";

/**
 * DELETE /api/admin/agent-shared-files/[id]
 * Admin deletes a shared file.
 */
export const DELETE = withCaller<{ id: string }>(
  async (_request, { caller, supabase, params }) => {
    const { id } = params;
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin(
      "agent-shared-files/[id] — platform-wide agent operations (no tenant scope)",
    );

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
  },
  { routeName: "admin/agent-shared-files/[id] DELETE" },
);
