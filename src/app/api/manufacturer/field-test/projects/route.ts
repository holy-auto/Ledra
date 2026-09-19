import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "名前は必須です。").max(200),
  description: z.string().trim().max(5000).optional(),
  product_name: z.string().trim().max(200).optional(),
  product_spec: z.record(z.string(), z.unknown()).optional(),
  budget: z.number().nonnegative().optional(),
  target_units: z.number().int().nonnegative().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
});

/**
 * GET /api/manufacturer/field-test/projects
 *
 * List field-test projects for the caller's manufacturer.
 * Optional ?status filter (e.g. ?status=draft).
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const status = new URL(req.url).searchParams.get("status");

  try {
    const admin = createServiceRoleAdmin("ft projects list — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_projects")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft projects GET");

    return apiJson({ projects: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft projects GET");
  }
}

/**
 * POST /api/manufacturer/field-test/projects
 *
 * Create a new field-test project. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("プロジェクト作成は admin ロールのみ実行できます。");

  const parsed = createProjectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft projects create — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_projects")
      .insert({
        manufacturer_id: manufacturerId,
        ...parsed.data,
        status: "draft",
        created_by: caller.userId,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft projects POST");

    return apiJson({ project: data });
  } catch (e) {
    return apiInternalError(e, "ft projects POST");
  }
}
