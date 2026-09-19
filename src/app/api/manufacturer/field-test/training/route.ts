import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveManufacturerCaller } from "@/lib/auth/manufacturerCaller";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(5000).optional(),
  content_url: z.string().url().max(2048).optional(),
  sort_order: z.number().int().min(0).optional(),
  is_required: z.boolean().optional(),
});

/**
 * GET /api/manufacturer/field-test/training?project_id=xxx
 *
 * List training modules filtered by project_id.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const projectId = new URL(req.url).searchParams.get("project_id");

  try {
    const admin = createServiceRoleAdmin("ft training modules list — caller-scoped read");
    const manufacturerId = caller.manufacturerId;

    let query = admin
      .from("ft_training_modules")
      .select("*")
      .eq("manufacturer_id", manufacturerId)
      .order("sort_order", { ascending: true });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "ft training modules GET");

    return apiJson({ modules: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft training modules GET");
  }
}

/**
 * POST /api/manufacturer/field-test/training
 *
 * Create a training module. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("研修管理は admin ロールのみ実行できます。");

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft training module create — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_training_modules")
      .insert({
        manufacturer_id: manufacturerId,
        project_id: parsed.data.project_id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        content_url: parsed.data.content_url ?? null,
        sort_order: parsed.data.sort_order ?? 0,
        is_required: parsed.data.is_required ?? false,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft training module POST");

    return apiJson({ module: data });
  } catch (e) {
    return apiInternalError(e, "ft training module POST");
  }
}
