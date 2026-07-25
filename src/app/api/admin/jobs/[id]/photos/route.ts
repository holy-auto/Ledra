import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { CERTIFICATE_IMAGE_BUCKET } from "@/lib/certificateImages";
import { isAnnotationDocument, type AnnotationDocument } from "@/components/imageMarkup/types";

export const dynamic = "force-dynamic";

type CertRow = { id: string; public_id: string; status: string; created_at: string };

/**
 * GET /api/admin/jobs/[id]/photos
 *
 * 案件 (= 予約) に紐付く車両 / 顧客の証明書写真を集約して返す。
 * JobDetailTabs の 📸 写真タブから使用。
 *
 * 既存の certificate_images をそのまま参照する (新規スキーマは作らない)。
 * 注釈は AnnotateExistingImageButton 経由で
 * PUT /api/certificates/images/[id]/annotations に書き込まれる。
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: reservationId } = await ctx.params;
    if (!reservationId) return apiNotFound("reservation id is required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: reservation, error: resErr } = await admin
      .from("reservations")
      .select("id, vehicle_id, customer_id")
      .eq("id", reservationId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (resErr) return apiInternalError(resErr, "job photos: reservation fetch");
    if (!reservation) return apiNotFound("reservation not found");

    // 関連する証明書を取得 (車両優先、無ければ顧客で fallback)。JobTabsLoader と同じ方針。
    let certs: CertRow[] = [];
    if (reservation.vehicle_id) {
      const { data, error } = await admin
        .from("certificates")
        .select("id, public_id, status, created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("vehicle_id", reservation.vehicle_id)
        .order("created_at", { ascending: false });
      if (error) return apiInternalError(error, "job photos: certs by vehicle");
      certs = (data ?? []) as CertRow[];
    } else if (reservation.customer_id) {
      const { data, error } = await admin
        .from("certificates")
        .select("id, public_id, status, created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", reservation.customer_id)
        .order("created_at", { ascending: false });
      if (error) return apiInternalError(error, "job photos: certs by customer");
      certs = (data ?? []) as CertRow[];
    }

    if (certs.length === 0) {
      return apiJson({ certificates: [], photos: [] });
    }

    const certIdToMeta = new Map(certs.map((c) => [c.id, c]));
    const { data: imageRows, error: imgErr } = await admin
      .from("certificate_images")
      .select(
        "id, certificate_id, storage_path, file_name, content_type, file_size, sort_order, annotations, created_at",
      )
      // service-role クライアントは RLS をバイパスするため、tenant_id を明示して越境取得を防ぐ
      // （certificate_images には tenant_id 列があり、他の全クエリと規約を揃える）。
      .eq("tenant_id", caller.tenantId)
      .in(
        "certificate_id",
        certs.map((c) => c.id),
      )
      .order("created_at", { ascending: false });
    if (imgErr) return apiInternalError(imgErr, "job photos: images fetch");

    const photos = await Promise.all(
      (imageRows ?? []).map(async (img) => {
        const cert = certIdToMeta.get(img.certificate_id as string);
        let signedUrl: string | null = null;
        try {
          const signed = await admin.storage
            .from(CERTIFICATE_IMAGE_BUCKET)
            .createSignedUrl(img.storage_path as string, 3600);
          signedUrl = signed.data?.signedUrl ?? null;
        } catch {
          signedUrl = null;
        }
        const ann: AnnotationDocument | null = isAnnotationDocument(img.annotations)
          ? (img.annotations as AnnotationDocument)
          : null;
        return {
          id: img.id as string,
          certificate_id: img.certificate_id as string,
          certificate_public_id: cert?.public_id ?? null,
          certificate_status: cert?.status ?? null,
          file_name: (img.file_name as string | null) ?? null,
          content_type: (img.content_type as string | null) ?? null,
          file_size: (img.file_size as number | null) ?? null,
          signed_url: signedUrl,
          annotations: ann,
          annotation_count: ann?.annotations.length ?? 0,
          created_at: img.created_at as string,
        };
      }),
    );

    return apiJson({
      certificates: certs.map((c) => ({ public_id: c.public_id, status: c.status, created_at: c.created_at })),
      photos,
    });
  } catch (e) {
    return apiInternalError(e, "job photos GET");
  }
}
