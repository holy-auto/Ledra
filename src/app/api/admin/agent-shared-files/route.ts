import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/api/auth";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/**
 * GET /api/admin/agent-shared-files?agent_id=xxx
 * List shared files for a specific agent.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const agentId = request.nextUrl.searchParams.get("agent_id");
    if (!agentId) return apiValidationError("agent_id is required");

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("agent_shared_files")
      .select("id, agent_id, direction, file_name, file_size, file_type, note, created_at")
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ files: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "admin/agent-shared-files GET");
  }
}

/**
 * POST /api/admin/agent-shared-files
 * Admin uploads a file to an agent (direction: to_agent).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const formData = await request.formData();
    const agentId = formData.get("agent_id") as string | null;
    const file = formData.get("file");
    const note = formData.get("note") as string | null;

    if (!agentId) return apiValidationError("agent_id is required");
    if (!file || !(file instanceof File)) return apiValidationError("file is required");
    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError(`ファイルサイズが上限（10MB）を超えています`);
    }
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_TYPES.some((t) => contentType.startsWith(t))) {
      return apiValidationError(`許可されていないファイル形式です: ${contentType}`);
    }

    const admin = getAdminClient();

    // Verify agent exists
    const { data: agent, error: agentErr } = await admin
      .from("agents")
      .select("id")
      .eq("id", agentId)
      .single();
    if (agentErr || !agent) return apiValidationError("agent not found");

    const uuid = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${agentId}/to_agent/${uuid}_${safeName}`;

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("agent-shared-files")
      .upload(storagePath, fileBuffer, { contentType, upsert: false });

    if (uploadErr) {
      return apiValidationError(`アップロードに失敗しました: ${uploadErr.message}`);
    }

    const { data: record, error: insertErr } = await admin
      .from("agent_shared_files")
      .insert({
        agent_id: agentId,
        uploaded_by: caller.userId,
        direction: "to_agent",
        file_name: file.name,
        file_size: file.size,
        file_type: contentType,
        storage_path: storagePath,
        note: note?.trim() || null,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({ file: record }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "admin/agent-shared-files POST");
  }
}
