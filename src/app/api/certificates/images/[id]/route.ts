import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { apiOk, apiInternalError, apiUnauthorized, apiNotFound } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id } = await params;
    if (!id) return apiNotFound("画像が見つかりません。");

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // Verify image belongs to this tenant via certificate ownership
    const { data: imageRow } = await admin
      .from("certificate_images")
      .select("id, storage_path, certificate_id, tenant_id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!imageRow) return apiNotFound("画像が見つかりません。");

    // Delete from storage first (non-fatal if storage delete fails — DB row removal is canonical)
    const { error: storageError } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).remove([imageRow.storage_path]);

    if (storageError) {
      console.error("[image delete] storage remove error", storageError);
    }

    // Delete DB row
    const { error: dbError } = await admin
      .from("certificate_images")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (dbError) {
      console.error("[image delete] db delete error", dbError);
      return apiInternalError(dbError, "image delete");
    }

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "image delete");
  }
}
