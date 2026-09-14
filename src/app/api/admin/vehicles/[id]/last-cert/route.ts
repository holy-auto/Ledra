import { NextRequest } from "next/server";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/vehicles/[id]/last-cert
 *
 * 指定車両の直近証明書から、次回発行時に引き継げるデータを返す。
 * 存在しない場合は { found: false } を返す。
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { id: vehicleId } = await params;

    const { data: cert } = await supabase
      .from("certificates")
      .select(
        "public_id, created_at, service_type, expiry_value, expiry_date, warranty_period_end, warranty_exclusions, coating_products_json, customer_name, templates(name)",
      )
      .eq("tenant_id", caller.tenantId)
      .eq("vehicle_id", vehicleId)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!cert) {
      return apiJson({ found: false });
    }

    return apiJson({
      found: true,
      cert: {
        public_id: cert.public_id,
        created_at: cert.created_at,
        service_type: cert.service_type ?? null,
        // テンプレート名は certificates ではなく templates 側にある
        template_name:
          (Array.isArray(cert.templates)
            ? cert.templates[0]?.name
            : (cert.templates as { name?: string } | null)?.name) ?? null,
        expiry_value: cert.expiry_value ?? null,
        expiry_date: cert.expiry_date ?? null,
        warranty_period_end: cert.warranty_period_end ?? null,
        warranty_exclusions: cert.warranty_exclusions ?? null,
        coating_products_json: cert.coating_products_json ?? [],
        customer_name: cert.customer_name ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "admin/vehicles/[id]/last-cert");
  }
}
