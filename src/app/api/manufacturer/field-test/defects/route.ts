import { NextRequest, after } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  project_id: z.string().uuid(),
  job_id: z.string().uuid().optional(),
  tenant_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  defect_code: z.string().max(100).optional(),
});

/**
 * GET /api/manufacturer/field-test/defects?project_id=xxx&severity=xxx&status=xxx&job_id=xxx
 *
 * List field-test defects with optional filters.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const jobId = url.searchParams.get("job_id");
  const severity = url.searchParams.get("severity");
  const status = url.searchParams.get("status");

  try {
    const admin = createServiceRoleAdmin("ft defects list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_defects")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (jobId) query = query.eq("job_id", jobId);
    if (severity) query = query.eq("severity", severity);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft defects GET");

    return apiJson({ defects: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft defects GET");
  }
}

/**
 * POST /api/manufacturer/field-test/defects
 *
 * Create a new defect record. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("不具合管理は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft defects create — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_defects")
      .insert({
        project_id: parsed.data.project_id,
        manufacturer_id: manufacturerId,
        job_id: parsed.data.job_id ?? null,
        tenant_id: parsed.data.tenant_id ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        severity: parsed.data.severity ?? "medium",
        defect_code: parsed.data.defect_code ?? null,
        reported_by: caller.userId,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft defects POST");

    const targetTenantId = (data.tenant_id ?? parsed.data.tenant_id) as string | null;
    if (targetTenantId) {
      after(async () => {
        await notifyFtTenant({
          tenantId: targetTenantId,
          type: "ft_defect_reported",
          title: "不具合が報告されました",
          body: `「${parsed.data.title}」（${parsed.data.severity ?? "medium"}）`,
          linkPath: "/admin/field-test",
          priority: "high",
        });
      });
    }

    return apiJson({ defect: data });
  } catch (e) {
    return apiInternalError(e, "ft defects POST");
  }
}
