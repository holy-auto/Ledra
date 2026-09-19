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

const upsertCheckSchema = z.object({
  job_id: z.string().uuid(),
  condition_id: z.string().uuid(),
  value_boolean: z.boolean().nullable().optional(),
  value_numeric: z.number().nullable().optional(),
  value_text: z.string().max(10000).nullable().optional(),
  value_photo_path: z.string().max(1000).nullable().optional(),
});

/**
 * GET /api/manufacturer/field-test/condition-checks?job_id=xxx
 *
 * List condition checks for a job. job_id is required.
 * Scoped through ft_jobs.manufacturer_id.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const jobId = new URL(req.url).searchParams.get("job_id");
  if (!jobId) return apiValidationError("job_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft condition-checks list — manufacturer-scoped via job");
    const manufacturerId = caller.manufacturerId;

    // Verify the job belongs to this manufacturer
    const { data: job, error: jobErr } = await admin
      .from("ft_jobs")
      .select("id")
      .eq("id", jobId)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (jobErr) return apiInternalError(jobErr, "ft condition-checks GET job lookup");
    if (!job) return apiNotFound("指定された案件が見つかりません。");

    const { data, error } = await admin
      .from("ft_condition_checks")
      .select("*")
      .eq("job_id", jobId)
      .order("checked_at", { ascending: true });
    if (error) return apiInternalError(error, "ft condition-checks GET");

    return apiJson({ checks: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft condition-checks GET");
  }
}

/**
 * POST /api/manufacturer/field-test/condition-checks
 *
 * Record/upsert a condition check. Admin only.
 * Upserts on (job_id, condition_id).
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("チェック記録は admin ロールのみ実行できます。");

  const parsed = upsertCheckSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft condition-checks upsert — admin caller");
    const manufacturerId = caller.manufacturerId;

    // Verify the job belongs to this manufacturer
    const { data: job, error: jobErr } = await admin
      .from("ft_jobs")
      .select("id")
      .eq("id", parsed.data.job_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (jobErr) return apiInternalError(jobErr, "ft condition-checks POST job lookup");
    if (!job) return apiNotFound("指定された案件が見つかりません。");

    const { data, error } = await admin
      .from("ft_condition_checks")
      .upsert(
        {
          job_id: parsed.data.job_id,
          condition_id: parsed.data.condition_id,
          value_boolean: parsed.data.value_boolean ?? null,
          value_numeric: parsed.data.value_numeric ?? null,
          value_text: parsed.data.value_text ?? null,
          value_photo_path: parsed.data.value_photo_path ?? null,
          checked_by: caller.userId,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "job_id,condition_id" },
      )
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft condition-checks POST");

    return apiJson({ check: data });
  } catch (e) {
    return apiInternalError(e, "ft condition-checks POST");
  }
}
