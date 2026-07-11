/**
 * GET  — LINE 自動返信用の店舗ナレッジ一覧 (テナントメンバー)。
 * POST — ナレッジを 1 件追加 (owner / admin のみ)。
 *
 * ここで登録した内容が inbound_message.auto_reply_knowledge の回答ソースに
 * なる (AI はこの内容のみから回答する)。テーブル未作成の環境では GET は
 * 空一覧に degrade して設定 UI を壊さない。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { logAiAuditEvent } from "@/lib/audit/aiAuditLog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** テナントあたりの登録上限。プロンプト注入は先頭 50 件 (knowledgeReplyAuto)。 */
const MAX_ENTRIES = 100;

/** テーブル未作成 (マイグレーション未適用) の検出。 */
function isMissingTableError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  return (err.message ?? "").toLowerCase().includes("does not exist");
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_line_knowledge")
      .select("id, title, content, enabled, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(MAX_ENTRIES);

    if (error) {
      if (isMissingTableError(error)) {
        return apiOk({
          entries: [],
          persisted: false,
          warning: "LINEナレッジのテーブルが未作成です。マイグレーション適用後に保存できるようになります。",
        });
      }
      return apiInternalError(error, "line-knowledge GET");
    }
    return apiOk({ entries: data ?? [], role: caller.role });
  } catch (e: unknown) {
    return apiInternalError(e, "line-knowledge GET");
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "質問/トピックを入力してください。").max(200),
  content: z.string().trim().min(1, "回答/知識本文を入力してください。").max(2000),
  enabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "admin")) {
      return apiForbidden("LINEナレッジの編集は管理者のみ行えます。");
    }

    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    const { count } = await admin
      .from("tenant_line_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if ((count ?? 0) >= MAX_ENTRIES) {
      return apiValidationError(`ナレッジは 1 店舗あたり ${MAX_ENTRIES} 件まで登録できます。`);
    }

    const { data, error } = await admin
      .from("tenant_line_knowledge")
      .insert({
        tenant_id: tenantId,
        title: parsed.data.title,
        content: parsed.data.content,
        enabled: parsed.data.enabled ?? true,
        created_by: caller.userId,
      })
      .select("id, title, content, enabled, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "line-knowledge POST insert");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { line_knowledge: { added: data?.id, title: parsed.data.title } },
    });

    return apiOk({ entry: data });
  } catch (e: unknown) {
    return apiInternalError(e, "line-knowledge POST");
  }
}
