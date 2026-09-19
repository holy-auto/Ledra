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
  result: z.enum(["pending", "pass", "fail", "conditional_pass"]).optional(),
  score: z.number().min(0).max(999.99).optional(),
  notes: z.string().max(10000).optional(),
  checklist: z.array(z.record(z.string(), z.unknown())).optional(),
  inspected_at: z.string().datetime().optional(),
});

/**
 * PATCH /api/manufacturer/field-test/inspections/[id]
 *
 * Update an existing inspection. Admin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("検査管理は admin ロールのみ実行できます。");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  const { id } = await params;

  try {
    const admin = createServiceRoleAdmin("ft inspections update — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_inspections")
      .update(updates)
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("検査記録が見つかりません。");
      return apiInternalError(error, "ft inspections PATCH");
    }

    return apiJson({ inspection: data });
  } catch (e) {
    return apiInternalError(e, "ft inspections PATCH");
  }
}
