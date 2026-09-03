import { z } from "zod";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiValidationError,
  apiNotFound,
  apiInternalError,
} from "@/lib/api/response";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { CONCERN_STATUSES, CONCERN_CATEGORIES } from "@/lib/concerns/types";

const patchSchema = z.object({
  status: z.enum(CONCERN_STATUSES).optional(),
  admin_response: z.string().trim().max(2000).optional(),
  category: z.enum(CONCERN_CATEGORIES).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/concerns/[id] — ステータス更新・管理者対応記録 */
export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力内容に誤りがあります");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // テナントスコープ確認
    const { data: existing } = await admin
      .from("customer_concerns")
      .select("id")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (!existing) return apiNotFound("懸念事項が見つかりません");

    const updates: Record<string, unknown> = {};
    if (parsed.data.status) {
      updates.status = parsed.data.status;
      if (parsed.data.status === "resolved" || parsed.data.status === "dismissed") {
        updates.resolved_by = caller.userId;
        updates.resolved_at = new Date().toISOString();
      } else {
        // open/investigating へ戻す(再オープン)ときは、以前の解決記録を残さない
        updates.resolved_by = null;
        updates.resolved_at = null;
      }
    }
    if (parsed.data.admin_response !== undefined) {
      updates.admin_response = parsed.data.admin_response;
    }
    if (parsed.data.category !== undefined) {
      updates.category = parsed.data.category;
    }

    if (Object.keys(updates).length === 0) {
      return apiValidationError("更新内容がありません");
    }

    const { data, error } = await admin
      .from("customer_concerns")
      .update(updates)
      .eq("id", id)
      .select("id, status, admin_response, category, resolved_at")
      .single();

    if (error) return apiInternalError(error, "admin/concerns PATCH");

    return apiJson({ ok: true, concern: data });
  } catch (e) {
    return apiInternalError(e, "admin/concerns PATCH");
  }
}
