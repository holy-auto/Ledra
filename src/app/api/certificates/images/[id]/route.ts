import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { apiOk, apiInternalError, apiUnauthorized, apiNotFound, apiForbidden } from "@/lib/api/response";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { enqueueCertificateAnchor } from "@/lib/anchoring/certificateAnchorService";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await checkRateLimit(req, "general");
    if (limited) return limited;

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requirePermission(caller, "certificates:edit")) return apiForbidden();

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

    // Delete DB row first (guarded by certificate_images_guard trigger — must
    // run before the storage removal, otherwise a blocked delete would have
    // already destroyed the actual photo bytes with no way to recover them).
    const { error: dbError } = await admin
      .from("certificate_images")
      .delete()
      .eq("id", id)
      .eq("tenant_id", caller.tenantId);

    if (dbError) {
      // ponytail: certificate_images_guard trigger raises P0001 when cert is not draft
      if (dbError.code === "P0001" && dbError.message?.includes("certificate_images")) {
        return Response.json(
          { error: "発行済み・取消済み・期限切れの証明書に紐づく写真は削除できません。" },
          { status: 409 },
        );
      }
      console.error("[image delete] db delete error", dbError);
      return apiInternalError(dbError, "image delete");
    }

    // DB row removal is canonical; the storage object is now safe to delete
    // (non-fatal if it fails — an orphaned file is a minor leak, not a
    // dangling reference).
    const { error: storageError } = await admin.storage.from(CERTIFICATE_IMAGE_BUCKET).remove([imageRow.storage_path]);

    if (storageError) {
      console.error("[image delete] storage remove error", storageError);
    }

    // 画像削除で image_sha256_set が変わるため証明書レコードの新しい digest を anchor
    // queue に積む (best-effort fire-and-forget / CERT_RECORD_ANCHOR_ENABLED=false なら no-op)。
    enqueueCertificateAnchor({
      tenantId: caller.tenantId,
      certificateId: imageRow.certificate_id as string,
    }).catch(() => {});

    return apiOk({ deleted: true });
  } catch (e) {
    return apiInternalError(e, "image delete");
  }
}
