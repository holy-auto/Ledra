/**
 * PATCH  — LINE ナレッジ 1 件の更新 (owner / admin のみ)。
 * DELETE — LINE ナレッジ 1 件の削除 (owner / admin のみ)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiNotFound, apiValidationError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { logAiAuditEvent } from "@/lib/audit/aiAuditLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(2000).optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = withCaller<{ id: string }>(
  async (req: NextRequest, { caller, params }) => {
    const { id } = params;
    if (!z.string().uuid().safeParse(id).success) return apiValidationError("不正な ID です。");

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;
    if (Object.keys(parsed.data).length === 0) return apiValidationError("変更内容がありません。");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // updated_at は DB トリガ (set_updated_at) が自動更新する。
    const { data, error } = await admin
      .from("tenant_line_knowledge")
      .update(parsed.data)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id, title, content, enabled, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound("ナレッジが見つかりません。");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { line_knowledge: { updated: id, fields: Object.keys(parsed.data) } },
    });

    return apiOk({ entry: data });
  },
  { minRole: "admin", routeName: "line-knowledge PATCH" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_req: NextRequest, { caller, params }) => {
    const { id } = params;
    if (!z.string().uuid().safeParse(id).success) return apiValidationError("不正な ID です。");

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    // 消えた行を select で確認する: 0 行削除 (既に削除済み / 他テナントの ID) を
    // 成功扱いにして幻の監査ログを残さない。
    const { data, error } = await admin
      .from("tenant_line_knowledge")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound("ナレッジが見つかりません。");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { line_knowledge: { deleted: id } },
    });

    return apiOk({ deleted: true });
  },
  { minRole: "admin", routeName: "line-knowledge DELETE" },
);
