/**
 * 運営専用: 全テナント共有ナレッジ 1 件の更新 / 削除 (isPlatformAdmin)。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { withCaller } from "@/lib/api/withCaller";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiForbidden, apiNotFound, apiValidationError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";

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

    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(req, updateSchema);
    if (!parsed.ok) return parsed.response;
    if (Object.keys(parsed.data).length === 0) return apiValidationError("変更内容がありません。");

    const admin = createPlatformScopedAdmin("platform/line-knowledge: 全テナント共有ナレッジの運営管理 (更新)");
    // updated_at は DB トリガ (set_updated_at) が自動更新する。
    const { data, error } = await admin
      .from("global_line_knowledge")
      .update(parsed.data)
      .eq("id", id)
      .select("id, title, content, enabled, created_at, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound("共有ナレッジが見つかりません。");

    return apiOk({ entry: data });
  },
  { routeName: "platform line-knowledge PATCH" },
);

export const DELETE = withCaller<{ id: string }>(
  async (_req: NextRequest, { caller, params }) => {
    const { id } = params;
    if (!z.string().uuid().safeParse(id).success) return apiValidationError("不正な ID です。");

    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("platform/line-knowledge: 全テナント共有ナレッジの運営管理 (削除)");
    const { data, error } = await admin.from("global_line_knowledge").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return apiNotFound("共有ナレッジが見つかりません。");

    return apiOk({ deleted: true });
  },
  { routeName: "platform line-knowledge DELETE" },
);
