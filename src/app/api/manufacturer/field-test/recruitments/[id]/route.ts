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

const updateRecruitmentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  is_open: z.boolean().optional(),
  deadline: z.string().datetime().nullable().optional(),
});

/**
 * PATCH /api/manufacturer/field-test/recruitments/[id]
 *
 * Update a recruitment (e.g. close it). Admin only.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("募集更新は admin ロールのみ実行できます。");

  const { id } = await ctx.params;

  const parsed = updateRecruitmentSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }

  try {
    const admin = createServiceRoleAdmin("ft recruitment update — admin caller scoped to own manufacturer_id");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_recruitments")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("募集が見つかりません。");
      return apiInternalError(error, "ft recruitment PATCH");
    }

    return apiJson({ recruitment: data });
  } catch (e) {
    return apiInternalError(e, "ft recruitment PATCH");
  }
}
