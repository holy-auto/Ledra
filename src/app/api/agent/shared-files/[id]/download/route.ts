import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiUnauthorized, apiForbidden, apiNotFound, apiInternalError } from "@/lib/api/response";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/agent/shared-files/[id]/download
 * Generate a signed URL for the agent to download a shared file.
 */
export async function POST(_request: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return apiUnauthorized();
    }

    const { data: agentStatus } = await supabase.rpc("get_my_agent_status");
    const agentRow = Array.isArray(agentStatus) ? agentStatus[0] : agentStatus;
    if (!agentRow?.agent_id) {
      return apiForbidden("not_agent");
    }

    // RLS ensures agent can only see their own files
    const { data: file, error: fileErr } = await supabase
      .from("agent_shared_files")
      .select("id, storage_path, file_name")
      .eq("id", id)
      .single();

    if (fileErr || !file) {
      return apiNotFound("file_not_found");
    }

    const { data: signedData, error: signErr } = await supabase.storage
      .from("agent-shared-files")
      .createSignedUrl(file.storage_path, 300, {
        download: file.file_name,
      });

    if (signErr || !signedData?.signedUrl) {
      return apiInternalError(new Error("download_url_failed"), "agent/shared-files/[id]/download signed URL");
    }

    return NextResponse.json({ url: signedData.signedUrl });
  } catch (e) {
    return apiInternalError(e, "agent/shared-files/[id]/download POST");
  }
}
