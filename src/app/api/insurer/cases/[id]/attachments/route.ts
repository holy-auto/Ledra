import { NextRequest, NextResponse } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { apiUnauthorized, apiValidationError, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = ["image/", "application/pdf", "text/", "application/msword", "application/vnd.openxmlformats"];

function isAllowedType(mimeType: string): boolean {
  return ALLOWED_TYPES.some((t) => (t.endsWith("/") ? mimeType.startsWith(t) : mimeType.startsWith(t)));
}

/**
 * POST /api/insurer/cases/[id]/attachments
 * Upload a file attachment to a case.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await checkRateLimit(req, "general");
  if (limited) return limited;

  const caller = await resolveInsurerCaller();
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;
  const admin = createAdminClient();

  try {
    // Verify case exists AND belongs to caller's insurer in a single query
    // (filter baked into the query, not a post-hoc check).
    const { data: caseData, error: caseErr } = await admin
      .from("insurer_cases")
      .select("id, insurer_id")
      .eq("id", id)
      .eq("insurer_id", caller.insurerId)
      .maybeSingle();

    if (caseErr) return apiValidationError(caseErr.message);
    if (!caseData) return apiNotFound("ケースが見つかりません。");

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return apiValidationError("file field is required.");
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiValidationError(
        `ファイルサイズが上限（10MB）を超えています。（${(file.size / 1024 / 1024).toFixed(1)}MB）`,
      );
    }

    const contentType = file.type || "application/octet-stream";
    if (!isAllowedType(contentType)) {
      return apiValidationError(`許可されていないファイル形式です: ${contentType}`);
    }

    // Generate storage path
    const uuid = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${caller.insurerId}/${id}/${uuid}_${safeName}`;

    // Upload to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { data: uploadData, error: uploadErr } = await admin.storage
      .from("case-attachments")
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      return apiValidationError(`ファイルアップロードに失敗しました: ${uploadErr.message}`);
    }

    // Create attachment record
    const { data: attachment, error: attachErr } = await admin
      .from("insurer_case_attachments")
      .insert({
        case_id: id,
        file_name: file.name,
        file_size: file.size,
        file_type: contentType,
        storage_path: uploadData.path,
        uploaded_by: caller.userId,
      })
      .select("id, case_id, file_name, file_size, file_type, storage_path, uploaded_by, created_at")
      .single();

    if (attachErr) return apiValidationError(attachErr.message);

    // Log to insurer_access_logs
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = req.headers.get("user-agent") ?? null;

    await admin.from("insurer_access_logs").insert({
      insurer_id: caller.insurerId,
      insurer_user_id: caller.insurerUserId,
      action: "case_attachment_upload",
      meta: {
        case_id: id,
        attachment_id: attachment.id,
        file_name: file.name,
        file_size: file.size,
        route: "POST /api/insurer/cases/[id]/attachments",
      },
      ip,
      user_agent: ua,
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    return apiInternalError(err, "POST /api/insurer/cases/[id]/attachments");
  }
}
