/**
 * PATCH  — 施工ナレッジ 1 件の更新 (staff 以上)。
 * DELETE — 施工ナレッジ 1 件の削除 (staff 以上)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiOk,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiValidationError,
} from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { logAiAuditEvent } from "@/lib/audit/aiAuditLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLS = "id, title, content, vehicle_model, tags, enabled, created_at, updated_at";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  vehicle_model: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) return apiValidationError("不正な ID です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("施工ナレッジの編集はスタッフ以上が行えます。");
    }

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;
    if (Object.keys(parsed.data).length === 0) return apiValidationError("変更内容がありません。");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // updated_at は DB トリガ (set_updated_at) が自動更新する。
    const { data, error } = await admin
      .from("tenant_field_knowledge")
      .update(parsed.data)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) return apiInternalError(error, "field-knowledge PATCH");
    if (!data) return apiNotFound("ナレッジが見つかりません。");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { field_knowledge: { updated: id, fields: Object.keys(parsed.data) } },
    });

    return apiOk({ entry: data });
  } catch (e: unknown) {
    return apiInternalError(e, "field-knowledge PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!z.string().uuid().safeParse(id).success) return apiValidationError("不正な ID です。");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("施工ナレッジの編集はスタッフ以上が行えます。");
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // 0 行削除 (既に削除済み / 他テナントの ID) は成功扱いにして幻の監査ログを残さない。
    const { data, error } = await admin
      .from("tenant_field_knowledge")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) return apiInternalError(error, "field-knowledge DELETE");
    if (!data) return apiNotFound("ナレッジが見つかりません。");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { field_knowledge: { deleted: id } },
    });

    return apiOk({ deleted: true });
  } catch (e: unknown) {
    return apiInternalError(e, "field-knowledge DELETE");
  }
}
