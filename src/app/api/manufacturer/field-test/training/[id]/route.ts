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

const patchSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  content_url: z.string().url().max(2048).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  is_required: z.boolean().optional(),
});

/**
 * PATCH /api/manufacturer/field-test/training/[id]
 *
 * Update a training module. Admin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("研修管理は admin ロールのみ実行できます。");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  if (Object.keys(parsed.data).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  try {
    const admin = createServiceRoleAdmin("ft training module update — admin caller");
    const manufacturerId = caller.manufacturerId;
    const { id } = await params;

    const { data, error } = await admin
      .from("ft_training_modules")
      .update({ ...parsed.data })
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("研修モジュールが見つかりません。");
      return apiInternalError(error, "ft training module PATCH");
    }
    return apiJson({ module: data });
  } catch (e) {
    return apiInternalError(e, "ft training module PATCH");
  }
}
