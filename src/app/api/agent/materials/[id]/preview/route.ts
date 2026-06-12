import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiJson, apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/agent/materials/[id]/preview
 *
 * Returns a short-lived signed URL for inline (in-browser) rendering of an
 * agent material — used by the iframe preview modal in the materials portal.
 *
 * Unlike the download route this does **not** pass a `download` filename to
 * `createSignedUrl`, so the browser renders the file inline (PDF viewer)
 * instead of forcing a save dialog. Previewing is read-only: it does not
 * record a download row or increment `download_count`.
 */
export async function GET(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    // Verify agent membership
    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) {
      return apiForbidden("not_agent");
    }

    // Fetch material (RLS already restricts to published rows for agents)
    const { data: material, error: matErr } = await supabase
      .from("agent_materials")
      .select("id, storage_path, file_type, is_published")
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (matErr || !material) {
      return apiNotFound("material_not_found");
    }

    // Signed URL WITHOUT the download option → browser renders inline
    const { data: signedData, error: signErr } = await supabase.storage
      .from("agent-materials")
      .createSignedUrl(material.storage_path, 300);

    if (signErr || !signedData?.signedUrl) {
      return apiInternalError(new Error("preview_url_failed"), "agent/materials/[id]/preview signed URL");
    }

    return apiJson({ url: signedData.signedUrl, file_type: material.file_type });
  } catch (e) {
    return apiInternalError(e, "agent/materials/[id]/preview GET");
  }
}
