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
import { isMissingTableError } from "@/lib/ai/automation/policy";
import { KNOWLEDGE_LIMIT } from "@/lib/ai/knowledgeReply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIGRATION_WARNING = "LINEナレッジのテーブルが未作成です。マイグレーション適用後に保存できるようになります。";

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
      .limit(KNOWLEDGE_LIMIT);

    if (error) {
      if (isMissingTableError(error)) {
        return apiOk({ entries: [], warning: MIGRATION_WARNING });
      }
      return apiInternalError(error, "line-knowledge GET");
    }
    return apiOk({ entries: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "line-knowledge GET");
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "質問/トピックを入力してください。").max(200),
  content: z.string().trim().min(1, "回答/知識本文を入力してください。").max(2000),
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

    // 登録上限 = プロンプト注入上限 (KNOWLEDGE_LIMIT)。登録したのに AI が参照
    // しないエントリを作らないため、両者は同じ定数を共有する。
    // ponytail: count→insert は非アトミックで、同時 POST では上限を数件超え得る。
    // 実害は「51 件目以降がプロンプトに載らない」だけなので許容。厳密化するなら
    // BEFORE INSERT トリガでの件数チェックに移行する。
    const { count, error: countError } = await admin
      .from("tenant_line_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countError) {
      if (isMissingTableError(countError)) return apiValidationError(MIGRATION_WARNING);
      return apiInternalError(countError, "line-knowledge POST count");
    }
    if ((count ?? 0) >= KNOWLEDGE_LIMIT) {
      return apiValidationError(`ナレッジは 1 店舗あたり ${KNOWLEDGE_LIMIT} 件まで登録できます。`);
    }

    const { data, error } = await admin
      .from("tenant_line_knowledge")
      .insert({
        tenant_id: tenantId,
        title: parsed.data.title,
        content: parsed.data.content,
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
