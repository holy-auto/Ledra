import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: material, error } = await admin
      .from("agent_materials")
      .select("id, storage_path, file_name, file_type")
      .eq("id", id)
      .single();

    if (error || !material) return apiNotFound("material_not_found");

    const { data: signedData, error: signErr } = await admin.storage
      .from("agent-materials")
      .createSignedUrl(material.storage_path, 300, {
        download: material.file_name,
      });

    if (signErr || !signedData?.signedUrl) {
      const msg = signErr?.message?.toLowerCase() ?? "";
      const isNotFound = msg.includes("not found") || msg.includes("does not exist");
      if (isNotFound) {
        return Response.json(
          {
            error: "file_not_in_storage",
            message:
              "ファイルがストレージにアップロードされていません。操作列の「差し替え」ボタンから実ファイルをアップロードしてください。",
          },
          { status: 404 },
        );
      }
      return apiInternalError(
        new Error(signErr?.message ?? "download_url_failed"),
        "admin/agent-materials/[id]/download",
      );
    }

    return apiJson({ url: signedData.signedUrl });
  } catch (e) {
    return apiInternalError(e, "admin/agent-materials/[id]/download GET");
  }
}
