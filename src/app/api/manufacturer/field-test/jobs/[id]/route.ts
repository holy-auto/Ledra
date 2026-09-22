import { NextRequest } from "next/server";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateJobSchema = z.object({
  status: z.enum(["assigned", "in_progress", "evidence_submitted", "inspection", "completed", "rejected"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
});

/**
 * GET /api/manufacturer/field-test/jobs/[id]
 *
 * Single job detail with condition checks, evidence count, and inspections.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;

  try {
    const admin = createServiceRoleAdmin("ft job detail — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    const { data: job, error } = await admin
      .from("ft_jobs")
      .select("*, tenants(name)")
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (error) return apiInternalError(error, "ft job GET");
    if (!job) return apiNotFound("案件が見つかりません。");

    // Fetch related data in parallel
    const [checksRes, evidenceRes, inspectionsRes] = await Promise.all([
      admin.from("ft_condition_checks").select("*").eq("job_id", id).order("checked_at", { ascending: true }),
      admin
        .from("ft_evidence")
        .select("id", { count: "exact", head: true })
        .eq("job_id", id)
        .eq("manufacturer_id", manufacturerId),
      admin
        .from("ft_inspections")
        .select("*")
        .eq("job_id", id)
        .eq("manufacturer_id", manufacturerId)
        .order("created_at", { ascending: false }),
    ]);

    if (checksRes.error) return apiInternalError(checksRes.error, "ft job GET checks");
    if (inspectionsRes.error) return apiInternalError(inspectionsRes.error, "ft job GET inspections");

    const tj = Array.isArray(job.tenants) ? job.tenants[0] : job.tenants;
    const { tenants: _t, ...jobData } = job as Record<string, unknown> & {
      tenants: unknown;
    };

    return apiJson({
      job: { ...jobData, tenant_name: (tj as { name: string | null } | null)?.name ?? null },
      condition_checks: checksRes.data ?? [],
      evidence_count: evidenceRes.count ?? 0,
      inspections: inspectionsRes.data ?? [],
    });
  } catch (e) {
    return apiInternalError(e, "ft job GET");
  }
}

/**
 * PATCH /api/manufacturer/field-test/jobs/[id]
 *
 * Update a job's status, title, or description. Admin only.
 * Setting status to "completed" automatically sets completed_at.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("案件更新は admin ロールのみ実行できます。");

  const { id } = await ctx.params;

  const parsed = updateJobSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  try {
    const admin = createServiceRoleAdmin("ft job update — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    // completed_at は "completed" のときだけ立て、他ステータスへ戻したら必ず消す。
    // （消し忘れると analytics/report の `if (j.completed_at)` 集計が過大になる。）
    const payload: Record<string, unknown> = { ...updates };
    if (updates.status === "completed") {
      payload.completed_at = new Date().toISOString();
    } else if (updates.status !== undefined) {
      payload.completed_at = null;
    }

    const { data, error } = await admin
      .from("ft_jobs")
      .update(payload)
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("案件が見つかりません。");
      return apiInternalError(error, "ft job PATCH");
    }

    return apiJson({ job: data });
  } catch (e) {
    return apiInternalError(e, "ft job PATCH");
  }
}
