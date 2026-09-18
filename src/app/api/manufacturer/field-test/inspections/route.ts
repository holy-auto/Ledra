import { NextRequest, after } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { notifyFtTenant } from "@/lib/fieldTest/ftNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  job_id: z.string().uuid(),
  result: z.enum(["pending", "pass", "fail", "conditional_pass"]).optional(),
  score: z.number().min(0).max(999.99).optional(),
  notes: z.string().max(10000).optional(),
  checklist: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * GET /api/manufacturer/field-test/inspections?project_id=xxx or ?job_id=xxx
 *
 * List field-test inspections filtered by project_id or job_id.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const jobId = url.searchParams.get("job_id");

  try {
    const admin = createServiceRoleAdmin("ft inspections list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_inspections")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (projectId) query = query.eq("project_id", projectId);
    if (jobId) query = query.eq("job_id", jobId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft inspections GET");

    return apiJson({ inspections: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft inspections GET");
  }
}

/**
 * POST /api/manufacturer/field-test/inspections
 *
 * Create a new inspection record. Admin only.
 * Resolves project_id from the referenced job.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("検査管理は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft inspections create — admin caller");
    const manufacturerId = caller.manufacturerId;

    // Resolve project_id from the job
    const { data: job, error: jobErr } = await admin
      .from("ft_jobs")
      .select("project_id, tenant_id")
      .eq("id", parsed.data.job_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (jobErr) return apiInternalError(jobErr, "ft inspections POST job lookup");
    if (!job) return apiNotFound("指定された案件が見つかりません。");

    const { data, error } = await admin
      .from("ft_inspections")
      .insert({
        job_id: parsed.data.job_id,
        project_id: job.project_id,
        manufacturer_id: manufacturerId,
        inspector_user_id: caller.userId,
        result: parsed.data.result ?? "pending",
        score: parsed.data.score ?? null,
        notes: parsed.data.notes ?? null,
        checklist: parsed.data.checklist ?? [],
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft inspections POST");

    const RESULT_JA: Record<string, string> = { pass: "合格", fail: "不合格", conditional_pass: "条件付合格", pending: "保留" };
    after(async () => {
      if (job.tenant_id) {
        const r = (parsed.data.result ?? "pending") as string;
        await notifyFtTenant({
          tenantId: job.tenant_id as string,
          type: "ft_inspection_completed",
          title: "検査結果が登録されました",
          body: `検査結果: ${RESULT_JA[r] ?? r}`,
          linkPath: "/admin/field-test",
        });
      }
    });

    return apiJson({ inspection: data });
  } catch (e) {
    return apiInternalError(e, "ft inspections POST");
  }
}
