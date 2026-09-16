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
  apiInternalError,
} from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createConditionSchema = z.object({
  project_id: z.string().uuid(),
  label: z.string().trim().min(1, "ラベルは必須です。").max(200),
  description: z.string().trim().max(5000).optional(),
  check_type: z.enum(["boolean", "numeric", "text", "photo"]).optional(),
  numeric_min: z.number().optional(),
  numeric_max: z.number().optional(),
  unit: z.string().trim().max(50).optional(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

/**
 * GET /api/manufacturer/field-test/conditions?project_id=xxx
 *
 * List conditions for a project. project_id is required.
 */
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();

  const projectId = new URL(req.url).searchParams.get("project_id");
  if (!projectId) return apiValidationError("project_id は必須です。");

  try {
    const admin = createServiceRoleAdmin("ft conditions list — manufacturer-scoped");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_conditions")
      .select("*")
      .eq("project_id", projectId)
      .eq("manufacturer_id", manufacturerId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return apiInternalError(error, "ft conditions GET");

    return apiJson({ conditions: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "ft conditions GET");
  }
}

/**
 * POST /api/manufacturer/field-test/conditions
 *
 * Create a new condition for a project. Admin only.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("条件管理は admin ロールのみ実行できます。");

  const parsed = createConditionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft conditions create — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_conditions")
      .insert({
        project_id: parsed.data.project_id,
        manufacturer_id: manufacturerId,
        label: parsed.data.label,
        description: parsed.data.description ?? null,
        check_type: parsed.data.check_type ?? "boolean",
        numeric_min: parsed.data.numeric_min ?? null,
        numeric_max: parsed.data.numeric_max ?? null,
        unit: parsed.data.unit ?? null,
        is_required: parsed.data.is_required ?? true,
        sort_order: parsed.data.sort_order ?? 0,
      })
      .select("*")
      .single();
    if (error) return apiInternalError(error, "ft conditions POST");

    return apiJson({ condition: data });
  } catch (e) {
    return apiInternalError(e, "ft conditions POST");
  }
}
