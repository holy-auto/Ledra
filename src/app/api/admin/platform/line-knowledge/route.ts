/**
 * 運営専用: LINE 自動返信の全テナント共有ナレッジ (global_line_knowledge)。
 *
 * - GET:  共有ナレッジ一覧
 * - POST: 共有ナレッジを 1 件追加
 *
 * ここで登録した内容は、auto_reply_knowledge を有効にした全テナントの
 * LINE AI 自動返信が共通の回答ソースとして参照する (店舗ナレッジと矛盾する
 * 場合は店舗側が優先)。isPlatformAdmin ゲート。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiForbidden, apiInternalError, apiValidationError } from "@/lib/api/response";
import { parseJsonBody } from "@/lib/api/parseBody";
import { isMissingTableError } from "@/lib/ai/automation/policy";
import { SHARED_KNOWLEDGE_LIMIT } from "@/lib/ai/knowledgeReply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MIGRATION_WARNING = "共有ナレッジのテーブルが未作成です。マイグレーション適用後に保存できるようになります。";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const admin = createPlatformScopedAdmin("platform/line-knowledge: 全テナント共有ナレッジの運営管理 (一覧)");
    const { data, error } = await admin
      .from("global_line_knowledge")
      .select("id, title, content, enabled, created_at, updated_at")
      .order("created_at", { ascending: true })
      .limit(SHARED_KNOWLEDGE_LIMIT);

    if (error) {
      if (isMissingTableError(error)) {
        return apiOk({ entries: [], warning: MIGRATION_WARNING });
      }
      return apiInternalError(error, "platform line-knowledge GET");
    }
    return apiOk({ entries: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "platform line-knowledge GET");
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
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;

    const admin = createPlatformScopedAdmin("platform/line-knowledge: 全テナント共有ナレッジの運営管理 (追加)");

    // 登録上限 = プロンプト注入上限 (SHARED_KNOWLEDGE_LIMIT)。
    // ponytail: count→insert は非アトミック (line-knowledge/route.ts と同じ許容)。
    const { count, error: countError } = await admin
      .from("global_line_knowledge")
      .select("id", { count: "exact", head: true });
    if (countError) {
      if (isMissingTableError(countError)) return apiValidationError(MIGRATION_WARNING);
      return apiInternalError(countError, "platform line-knowledge POST count");
    }
    if ((count ?? 0) >= SHARED_KNOWLEDGE_LIMIT) {
      return apiValidationError(`共有ナレッジは ${SHARED_KNOWLEDGE_LIMIT} 件まで登録できます。`);
    }

    const { data, error } = await admin
      .from("global_line_knowledge")
      .insert({
        title: parsed.data.title,
        content: parsed.data.content,
        created_by: caller.userId,
      })
      .select("id, title, content, enabled, created_at, updated_at")
      .single();
    if (error) return apiInternalError(error, "platform line-knowledge POST insert");

    return apiOk({ entry: data });
  } catch (e: unknown) {
    return apiInternalError(e, "platform line-knowledge POST");
  }
}
