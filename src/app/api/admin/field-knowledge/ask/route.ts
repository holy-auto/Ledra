/**
 * POST /api/admin/field-knowledge/ask
 *
 * 現場スタッフの質問に、店舗に登録された施工ナレッジ (tenant_field_knowledge)
 * だけを根拠に AI が回答する (RAG は使わず enabled 全件を注入)。ナレッジに無い
 * 質問は can_answer=false で返し、AI がナレッジ外の答えを創作しない
 * (CLAUDE.md「AI は事実を作ってはいけない」)。
 *
 * gating: プラン機能 ai_academy_qa (Standard 以上)。AI 使用量は
 * startAiRouteUsage 経由で ai_usage_logs 記録 + 月次コストキャップ加算。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiOk, apiUnauthorized, apiInternalError, apiValidationError, apiForbidden } from "@/lib/api/response";
import { canUseFeature } from "@/lib/billing/planFeatures";
import { fastModelForPlanTier } from "@/lib/ai/client";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { isMissingTableError, loadAiAutomationSettings } from "@/lib/ai/automation/policy";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { answerFieldKnowledge, FIELD_KNOWLEDGE_LIMIT } from "@/lib/ai/fieldKnowledgeAnswer";
import type { KnowledgeEntry } from "@/lib/ai/knowledgeReply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const askSchema = z.object({
  question: z.string().trim().min(3, "質問を3文字以上で入力してください。").max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    // AI 呼び出しは staff 以上 (代表判断 2026-09-01。閲覧専用ロールに費用の出る操作をさせない)
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // スクリプトによる連投コストを防ぐ AI レート制限 (ユーザ単位)。
    const limited = await checkRateLimit(req, "ai", caller.userId);
    if (limited) return limited;

    if (!canUseFeature(caller.planTier, "ai_academy_qa")) {
      return apiValidationError("この機能はStandardプラン以上でご利用いただけます。", { code: "plan_limit" });
    }

    // AI マスタースイッチ OFF / 月次コストキャップ超過のテナントは呼ばせない。
    const aiSettings = await loadAiAutomationSettings(caller.tenantId);
    if (!aiSettings.enabled) {
      return apiValidationError("AI が無効か、今月の利用上限に達しています。設定をご確認ください。", {
        code: "ai_disabled",
      });
    }

    const parsed = askSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin, tenantId } = createTenantScopedAdmin(caller.tenantId);
    const { data: rows, error } = await admin
      .from("tenant_field_knowledge")
      .select("title, content, vehicle_model, tags")
      .eq("tenant_id", tenantId)
      .eq("enabled", true)
      .order("created_at", { ascending: true })
      .limit(FIELD_KNOWLEDGE_LIMIT);

    if (error) {
      // テーブル未作成 / 取得失敗時はナレッジ 0 件扱い (can_answer=false)。
      if (!isMissingTableError(error)) return apiInternalError(error, "field-knowledge ask");
    }

    // 対象車種 / タグは UI に表示されるが本文には含まれないため、回答根拠として
    // ナレッジ本文に畳み込む (車種別メモを取りこぼさない)。
    const knowledge: KnowledgeEntry[] = (rows ?? []).map((r) => {
      const row = r as { title: string; content: string; vehicle_model?: string | null; tags?: string[] | null };
      const meta = [
        row.vehicle_model ? `対象車種: ${row.vehicle_model}` : null,
        Array.isArray(row.tags) && row.tags.length > 0 ? `タグ: ${row.tags.join(", ")}` : null,
      ].filter(Boolean);
      return { title: row.title, content: meta.length > 0 ? `${meta.join(" / ")}\n${row.content}` : row.content };
    });

    const usage = startAiRouteUsage("/api/admin/field-knowledge/ask");
    const result = await answerFieldKnowledge(
      { question: parsed.data.question, knowledge },
      { model: fastModelForPlanTier(caller.planTier) },
    );
    usage.record({
      tenantId,
      userId: caller.userId,
      outcome: result.ai ? "ok" : "ai_disabled",
      confidence: result.confidence,
    });

    return apiOk({ result });
  } catch (e: unknown) {
    return apiInternalError(e, "field-knowledge ask");
  }
}
