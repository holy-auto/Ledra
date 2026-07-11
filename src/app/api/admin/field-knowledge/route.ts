/**
 * GET  — 現場スタッフ向け施工ナレッジ一覧 (テナントメンバー)。
 * POST — ナレッジを 1 件追加 (staff 以上)。
 *
 * ここで登録した内容が field-knowledge/ask の AI 回答ソースになる
 * (AI はこの内容のみから回答する)。テーブル未作成の環境では GET は
 * 空一覧に degrade して UI を壊さない。line-knowledge (顧客向け・admin 限定)
 * と違い、現場技術者 (staff) が知見を足せるようにする。
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
import { FIELD_KNOWLEDGE_LIMIT } from "@/lib/ai/fieldKnowledgeAnswer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT_COLS = "id, title, content, vehicle_model, tags, enabled, created_at, updated_at";
const MIGRATION_WARNING = "施工ナレッジのテーブルが未作成です。マイグレーション適用後に保存できるようになります。";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data, error } = await admin
      .from("tenant_field_knowledge")
      .select(SELECT_COLS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .limit(FIELD_KNOWLEDGE_LIMIT);

    if (error) {
      if (isMissingTableError(error)) return apiOk({ entries: [], warning: MIGRATION_WARNING });
      return apiInternalError(error, "field-knowledge GET");
    }
    return apiOk({ entries: data ?? [] });
  } catch (e: unknown) {
    return apiInternalError(e, "field-knowledge GET");
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, "トピックを入力してください。").max(200),
  content: z.string().trim().min(1, "ナレッジ本文を入力してください。").max(2000),
  vehicle_model: z.string().trim().max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) {
      return apiForbidden("施工ナレッジの編集はスタッフ以上が行えます。");
    }

    const parsed = await parseJsonBody(req, createSchema);
    if (!parsed.ok) return parsed.response;

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);

    // 登録上限 = プロンプト注入上限 (FIELD_KNOWLEDGE_LIMIT)。登録したのに AI が
    // 参照しないエントリを作らないため両者は同じ定数を共有する。
    // ponytail: count→insert は非アトミック。同時 POST で数件超え得るが実害は
    // 「上限超過分がプロンプトに載らない」だけなので許容 (line-knowledge と同方針)。
    const { count, error: countError } = await admin
      .from("tenant_field_knowledge")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (countError) {
      if (isMissingTableError(countError)) return apiValidationError(MIGRATION_WARNING);
      return apiInternalError(countError, "field-knowledge POST count");
    }
    if ((count ?? 0) >= FIELD_KNOWLEDGE_LIMIT) {
      return apiValidationError(`施工ナレッジは 1 店舗あたり ${FIELD_KNOWLEDGE_LIMIT} 件まで登録できます。`);
    }

    const { data, error } = await admin
      .from("tenant_field_knowledge")
      .insert({
        tenant_id: tenantId,
        title: parsed.data.title,
        content: parsed.data.content,
        vehicle_model: parsed.data.vehicle_model || null,
        tags: parsed.data.tags ?? [],
        created_by: caller.userId,
      })
      .select(SELECT_COLS)
      .single();
    if (error) return apiInternalError(error, "field-knowledge POST insert");

    void logAiAuditEvent({
      tenantId,
      userId: caller.userId,
      action: "ai_settings_changed",
      detail: { field_knowledge: { added: data?.id, title: parsed.data.title } },
    });

    return apiOk({ entry: data });
  } catch (e: unknown) {
    return apiInternalError(e, "field-knowledge POST");
  }
}
