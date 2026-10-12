import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiInternalError, apiValidationError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturer/field-test/workshop-profiles
 *
 * プロジェクトに参加している施工店（応募承認済み＋案件割当済み）の設備・資格を返す。project_id は必須。
 * 設備・資格はメーカーをまたいで1施工店1行なので、条件なし・施工店指定で全施工店を返す分岐は置かない
 * （以前はあり、どのメーカーからも他社の施工店の許可番号・資格者名が読めた）。
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");

  try {
    if (!projectId) return apiValidationError("project_id は必須です。");
    const admin = createServiceRoleAdmin("workshop profiles list — manufacturer-scoped");

    // Collect tenant IDs from approved applications + assigned jobs
    const [appResult, jobResult] = await Promise.all([
      admin
        .from("ft_applications")
        .select("tenant_id")
        .eq("project_id", projectId)
        .eq("manufacturer_id", caller.manufacturerId)
        .eq("status", "approved"),
      admin
        .from("ft_jobs")
        .select("tenant_id")
        .eq("project_id", projectId)
        .eq("manufacturer_id", caller.manufacturerId),
    ]);
    if (appResult.error) return apiInternalError(appResult.error, "workshop profiles GET applications");
    if (jobResult.error) return apiInternalError(jobResult.error, "workshop profiles GET jobs");

    const tenantIds = [
      ...new Set([
        ...(appResult.data?.map((r) => r.tenant_id) ?? []),
        ...(jobResult.data?.map((r) => r.tenant_id) ?? []),
      ]),
    ];

    if (tenantIds.length === 0) return apiJson({ profiles: [] });

    const { data, error } = await admin
      .from("workshop_capability_profiles")
      .select("*, tenants(name)")
      .in("tenant_id", tenantIds);
    if (error) return apiInternalError(error, "workshop profiles GET");
    // 設備タブは tenant_name を読む
    type TenantJoinRow = Record<string, unknown> & {
      tenants: { name: string | null } | { name: string | null }[] | null;
    };
    const profiles = (data ?? []).map((r: TenantJoinRow) => {
      const tj = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
      return { ...r, tenant_name: tj?.name ?? null, tenants: undefined };
    });
    return apiJson({ profiles });
  } catch (e) {
    return apiInternalError(e, "workshop profiles GET");
  }
}
