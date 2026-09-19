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
  accepted: z.boolean().optional(),
  document_url: z.string().url().max(2048).nullable().optional(),
  document_text: z.string().max(50000).nullable().optional(),
});

/**
 * PATCH /api/manufacturer/field-test/agreements/[id]
 *
 * Update a field-test agreement (e.g. mark as accepted). Admin only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("契約管理は admin ロールのみ実行できます。");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(updates).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  // When marking as accepted, record who and when
  if (parsed.data.accepted === true) {
    updates.accepted_by = caller.userId;
    updates.accepted_at = new Date().toISOString();
  }

  try {
    const admin = createServiceRoleAdmin("ft agreement update — admin caller");
    const manufacturerId = caller.manufacturerId;
    const { id } = await params;

    const { data, error } = await admin
      .from("ft_agreements")
      .update(updates)
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("契約が見つかりません。");
      return apiInternalError(error, "ft agreement PATCH");
    }
    return apiJson({ agreement: data });
  } catch (e) {
    return apiInternalError(e, "ft agreement PATCH");
  }
}
