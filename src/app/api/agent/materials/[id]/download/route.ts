import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, ctx: RouteContext) {
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

    // Fetch material
    const { data: material, error: matErr } = await supabase
      .from("agent_materials")
      .select("id, storage_path, file_name, is_published")
      .eq("id", id)
      .eq("is_published", true)
      .single();

    if (matErr || !material) {
      return apiNotFound("material_not_found");
    }

    // Generate signed URL for download
    const { data: signedData, error: signErr } = await supabase.storage
      .from("agent-materials")
      .createSignedUrl(material.storage_path, 300, {
        download: material.file_name,
      });

    if (signErr || !signedData?.signedUrl) {
      return apiInternalError(new Error("download_url_failed"), "agent/materials/[id]/download signed URL");
    }

    // Record download
    const admin = getAdminClient();
    await Promise.all([
      admin.from("agent_material_downloads").insert({
        material_id: id,
        user_id: auth.user.id,
        agent_id: agentRow.agent_id,
      }),
      admin
        .from("agent_materials")
        .update({ download_count: (material as any).download_count + 1 })
        .eq("id", id),
    ]).catch(() => {
      // download tracking is best-effort
    });

    return NextResponse.json({ url: signedData.signedUrl });
  } catch (e) {
    return apiInternalError(e, "agent/materials/[id]/download POST");
  }
}
