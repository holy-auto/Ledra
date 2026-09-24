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
  status: z.enum(["open", "investigating", "resolved", "closed", "wontfix"]).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  resolution: z.string().max(10000).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
});

/**
 * PATCH /api/manufacturer/field-test/defects/[id]
 *
 * Update an existing defect. Admin only.
 * If status transitions to "resolved" or "closed", resolved_at / resolved_by are set automatically.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveManufacturerCaller(supabase);
  if (!caller) return apiUnauthorized();
  if (caller.role !== "admin") return apiForbidden("不具合管理は admin ロールのみ実行できます。");

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return apiValidationError(parsed.error.issues[0]?.message ?? "入力に誤りがあります。");
  }
  const updates: Record<string, unknown> = { ...parsed.data };
  if (Object.keys(updates).length === 0) {
    return apiValidationError("更新項目がありません。");
  }

  // resolved/closed のときだけ resolved_at/by を立て、他ステータスへ戻したら消す。
  // （消し忘れると CSV の 解決日 が未解決の不具合にも出る＝ft_jobs.completed_at と同型。）
  if (updates.status === "resolved" || updates.status === "closed") {
    updates.resolved_at = new Date().toISOString();
    updates.resolved_by = caller.userId;
  } else if (updates.status !== undefined) {
    updates.resolved_at = null;
    updates.resolved_by = null;
  }

  const { id } = await params;

  try {
    const admin = createServiceRoleAdmin("ft defects update — admin caller");
    const manufacturerId = caller.manufacturerId;

    const { data, error } = await admin
      .from("ft_defects")
      .update(updates)
      .eq("id", id)
      .eq("manufacturer_id", manufacturerId)
      .select("*")
      .single();
    if (error) {
      if (error.code === "PGRST116") return apiNotFound("不具合が見つかりません。");
      return apiInternalError(error, "ft defects PATCH");
    }

    return apiJson({ defect: data });
  } catch (e) {
    return apiInternalError(e, "ft defects PATCH");
  }
}
