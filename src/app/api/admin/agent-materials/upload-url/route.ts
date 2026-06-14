import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { MATERIALS_BUCKET, MAX_MATERIAL_SIZE, isAllowedMaterialType, materialStoragePath } from "../storage";

export const dynamic = "force-dynamic";

/**
 * Issues a short-lived signed upload URL so the browser can upload the file
 * **directly** to Supabase Storage, bypassing the hosting platform's request
 * body size limit (Vercel serverless functions cap bodies at ~4.5MB, which is
 * easily exceeded by a .pptx / .pdf and surfaces to the user as HTTP 413).
 *
 * The actual DB record is created afterwards by POST /api/admin/agent-materials
 * with a small JSON metadata body referencing the uploaded `storage_path`.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) return apiForbidden();

    const body = (await request.json().catch(() => null)) as {
      file_name?: unknown;
      file_type?: unknown;
      file_size?: unknown;
    } | null;

    const fileName = typeof body?.file_name === "string" ? body.file_name : "";
    const fileType = typeof body?.file_type === "string" ? body.file_type : "";
    const fileSize = typeof body?.file_size === "number" ? body.file_size : NaN;

    if (!fileName) return apiValidationError("file_name is required");
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return apiValidationError("file_size is required");
    }
    if (fileSize > MAX_MATERIAL_SIZE) {
      return apiValidationError(
        `ファイルサイズは ${Math.floor(MAX_MATERIAL_SIZE / (1024 * 1024))}MB 以下にしてください。`,
      );
    }
    if (!isAllowedMaterialType(fileType, fileName)) {
      return apiValidationError("このファイル形式はアップロードできません。");
    }

    const storagePath = materialStoragePath(fileName);

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin.storage.from(MATERIALS_BUCKET).createSignedUploadUrl(storagePath);

    if (error || !data?.token) {
      return apiInternalError(error ?? new Error("signed_upload_url_failed"), "agent-materials upload-url");
    }

    return apiJson({ path: data.path, token: data.token, storage_path: storagePath });
  } catch (e) {
    return apiInternalError(e, "agent-materials upload-url POST");
  }
}
