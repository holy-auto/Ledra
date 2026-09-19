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

const updateConditionSchema = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  check_type: z.enum(["boolean", "numeric", "text", "photo"]).optional(),
  numeric_min: z.number().nullable().optional(),
  numeric_max: z.number().nullable().optional(),
  unit: z.string().trim().max(50).nullable().optional(),
  is_required: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
});

/**
 * PATCH /api/manufacturer/field-test/conditions/[id]
 *
 * Update a condition. Admin only. Partial update.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("条件更新は admin ロールのみ実行できます。");

  const { id } = await ctx.params;

  const parsed = updateConditionSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  if (Object.keys(parsed.data).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  try {
    const admin = createServiceRoleAdmin("ft condition update — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_conditions")
      .update({ ...parsed.data })
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("条件が見つかりません。");
      return apiInternalError(error, "ft condition PATCH");
    }

    return apiJson({ condition: data });
  } catch (e) {
    return apiInternalError(e, "ft condition PATCH");
  }
}
