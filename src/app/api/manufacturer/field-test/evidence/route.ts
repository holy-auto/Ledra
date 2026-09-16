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

const createSchema = z.object({
  job_id: z.string().uuid(),
  evidence_type: z.enum([
    "photo_before",
    "photo_during",
    "photo_after",
    "measurement",
    "env_data",
    "video",
    "document",
    "other",
  ]),
  file_path: z.string().max(2048).optional(),
  file_name: z.string().max(512).optional(),
  content_type: z.string().max(255).optional(),
  caption: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  captured_at: z.string().datetime().optional(),
});

/**
 * GET /api/manufacturer/field-test/evidence?job_id=xxx or ?project_id=xxx
 *
 * List field-test evidence filtered by job_id or project_id.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const url = new URL(req.url);
  const jobId = url.searchParams.get("job_id");
  const projectId = url.searchParams.get("project_id");

  try {
    const admin = createServiceRoleAdmin("ft evidence list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_evidence")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (jobId) query = query.eq("job_id", jobId);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft evidence GET");

    return apiJson({ evidence: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft evidence GET");
  }
}

/**
 * POST /api/manufacturer/field-test/evidence
 *
 * Create a new evidence record. Admin only.
 * Resolves project_id / tenant_id from the referenced job.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("証拠管理は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft evidence create — admin caller");
    const manufacturerId = caller.manufacturerId;

    // Resolve project_id / tenant_id from the job
    const { data: job, error: jobErr } = await admin
      .from("ft_jobs")
      .select("project_id, tenant_id")
      .eq("id", parsed.data.job_id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (jobErr) return apiInternalError(jobErr, "ft evidence POST job lookup");
    if (!job) return apiNotFound("指定された案件が見つかりません。");

    const { data, error } = await admin
      .from("ft_evidence")
      .insert({
        job_id: parsed.data.job_id,
        project_id: job.project_id,
        manufacturer_id: manufacturerId,
        tenant_id: job.tenant_id,
        evidence_type: parsed.data.evidence_type,
        file_path: parsed.data.file_path ?? null,
        file_name: parsed.data.file_name ?? null,
        content_type: parsed.data.content_type ?? null,
        caption: parsed.data.caption ?? null,
        metadata: parsed.data.metadata ?? {},
        captured_at: parsed.data.captured_at ?? null,
        captured_by: caller.userId,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft evidence POST");

    return apiJson({ evidence: data });
  } catch (e) {
    return apiInternalError(e, "ft evidence POST");
  }
}
