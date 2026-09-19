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

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  product_name: z.string().trim().max(200).nullable().optional(),
  product_spec: z.record(z.string(), z.unknown()).optional(),
  budget: z.number().nonnegative().nullable().optional(),
  target_units: z.number().int().nonnegative().nullable().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["draft", "recruiting", "active", "completed", "archived"]).optional(),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
});

/**
 * GET /api/manufacturer/field-test/projects/[id]
 *
 * Single project detail with summary counts.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const { id } = await ctx.params;

  try {
    const admin = createServiceRoleAdmin("ft project detail — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    const { data: project, error } = await admin
      .from("ft_projects")
      .select("*")
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .maybeSingle();
    if (error) return apiInternalError(error, "ft project GET");
    if (!project) return apiNotFound("プロジェクトが見つかりません。");

    // Fetch summary counts in parallel
    const [recruitments, applications, jobs] = await Promise.all([
      admin
        .from("ft_recruitments")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("manufacturer_id", manufacturerId),
      admin
        .from("ft_applications")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("manufacturer_id", manufacturerId),
      admin
        .from("ft_jobs")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id)
        .eq("manufacturer_id", manufacturerId),
    ]);

    return apiJson({
      project: {
        ...project,
        _counts: {
          recruitments: recruitments.count ?? 0,
          applications: applications.count ?? 0,
          jobs: jobs.count ?? 0,
        },
      },
    });
  } catch (e) {
    return apiInternalError(e, "ft project GET");
  }
}

/**
 * PATCH /api/manufacturer/field-test/projects/[id]
 *
 * Update a field-test project. Admin only.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("プロジェクト更新は admin ロールのみ実行できます。");

  const { id } = await ctx.params;

  const parsed = updateProjectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft project update — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_projects")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("プロジェクトが見つかりません。");
      return apiInternalError(error, "ft project PATCH");
    }

    return apiJson({ project: data });
  } catch (e) {
    return apiInternalError(e, "ft project PATCH");
  }
}
