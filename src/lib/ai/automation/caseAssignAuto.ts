/**
 * 保険案件 (claim) 作成時に担当者候補を、人の操作なしで自動提案する IO 層。
 *
 * 保険案件作成ルート (`/api/insurer/cases` POST) から、レスポンス送出後に `after()` 経由で
 * **fire-and-forget** で呼ばれる。after() は auth セッションが切れているため service-role で
 * 読み書きし (insurer_id / tenant_id で明示スコープ)、絶対に throw しない。
 *
 * 段階:
 *   1. 案件のテナント (tenant_id) を opt-in 判定のキーにする。テナント未紐付けならスキップ。
 *   2. settings をロードし insurer_case.auto_assign_suggest が opt-in 済みか確認 (既定 OFF)。
 *   3. ルールで既に自動割当済みの案件 (assigned_to あり) には提案しない。
 *   4. suggestCaseAssignees (ルール → 履歴 → AI → fallback) を実行し、
 *      insurer_cases.meta.ai_assign_suggestion に **候補として** 保存。
 *
 * 壁3 とは無関係: 出力は担当者候補の注釈のみで、割当 (確定) は必ず人が行う。
 */
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { suggestCaseAssignees, type CasePriority } from "@/lib/ai/caseAssignSuggest";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";
import { logger } from "@/lib/logger";
import { loadAiAutomationSettings } from "./policy";
import { shouldAutoSuggestAssignee } from "./orchestrator";

const AUTO_ASSIGN_ENDPOINT = "/api/insurer/cases#auto-assign-suggest";

export interface MaybeAutoSuggestAssigneeParams {
  caseId: string;
  insurerId: string;
  /** 案件に紐づくテナント (opt-in 判定キー)。null ならスキップ。 */
  tenantId: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * 指定した保険案件に担当者候補を自動提案する。失敗しても投げない。
 */
export async function maybeAutoSuggestAssigneeForCase(params: MaybeAutoSuggestAssigneeParams): Promise<void> {
  const { caseId, insurerId, tenantId } = params;
  try {
    if (!caseId || !insurerId || !tenantId) return;

    const settings = await loadAiAutomationSettings(tenantId);
    if (!shouldAutoSuggestAssignee(settings)) return;

    const admin = createServiceRoleAdmin("AI auto assign-suggest — insurer case create after() lacks auth session");

    const { data: tenant } = await admin.from("tenants").select("is_active").eq("id", tenantId).single();
    if (!tenant || tenant.is_active === false) return;

    // 案件を取得 (insurer_id で明示スコープ)。
    const { data: insCase } = await admin
      .from("insurer_cases")
      .select("id, insurer_id, title, description, priority, category, assigned_to, meta")
      .eq("id", caseId)
      .eq("insurer_id", insurerId)
      .maybeSingle();
    if (!insCase) return;

    // ルールで既に自動割当済みなら提案不要。
    if (insCase.assigned_to) return;

    // 既に自動提案済みなら再実行しない (同一案件への多重発火を防ぐ)。
    const existingMeta = asRecord(insCase.meta);
    if (asRecord(existingMeta.ai_assign_suggestion).source === "auto") return;

    // 振り分けルール / insurer ユーザー / 過去アサイン履歴を並列取得 (insurer_id スコープ)。
    const [rulesRes, usersRes, historyRes] = await Promise.all([
      admin
        .from("insurer_assignment_rules")
        .select("condition_type, condition_value, assign_to, is_active")
        .eq("insurer_id", insurerId)
        .eq("is_active", true),
      admin.from("insurer_users").select("id, display_name").eq("insurer_id", insurerId),
      admin
        .from("insurer_cases")
        .select("category, priority, assigned_to")
        .eq("insurer_id", insurerId)
        .not("assigned_to", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const users = (usersRes.data ?? []) as Array<{ id: string; display_name: string | null }>;
    // 候補ユーザーが居なければ提案しても意味がない。
    if (users.length === 0) return;

    const usage = startAiRouteUsage(AUTO_ASSIGN_ENDPOINT);
    const result = await suggestCaseAssignees({
      category: insCase.category as string | null,
      priority: ((insCase.priority as string) || "normal") as CasePriority,
      subject: insCase.title as string | null,
      body: insCase.description as string | null,
      history: (historyRes.data ?? []) as Array<{
        category: string | null;
        priority: string | null;
        assigned_to: string | null;
      }>,
      users: users.map((u) => ({ id: u.id, display_name: u.display_name })),
      rules: (rulesRes.data ?? []) as Array<{
        condition_type: string;
        condition_value: string;
        assign_to: string;
        is_active: boolean;
      }>,
    });

    // 候補が出なければ保存しない (空提案で UI を汚さない)。
    if (result.candidates.length === 0) return;

    const topConfidence = result.candidates[0]?.score ?? null;
    usage.record({
      tenantId,
      insurerId,
      outcome: "ok",
      confidence: topConfidence,
      meta: { auto: true, ai: result.ai, candidates: result.candidates.length },
    });

    const ai_assign_suggestion = {
      suggested_at: new Date().toISOString(),
      source: "auto" as const,
      ai: result.ai,
      candidates: result.candidates.slice(0, 3),
    };

    const { error: upErr } = await admin
      .from("insurer_cases")
      .update({ meta: { ...existingMeta, ai_assign_suggestion } })
      .eq("id", caseId)
      .eq("insurer_id", insurerId);
    if (upErr) {
      logger.warn("[caseAssignAuto] meta update failed", { caseId, err: upErr.message });
    }

    // 監査ログ (手動 ai-assign-suggest と対になる auto 版)
    await admin
      .from("insurer_access_logs")
      .insert({
        insurer_id: insurerId,
        action: "case_assign_suggest_auto",
        meta: { case_id: caseId, ai: result.ai, candidates: result.candidates.length },
      })
      .then(() => {});
  } catch (e) {
    logger.warn("[caseAssignAuto] maybeAutoSuggestAssigneeForCase threw", {
      caseId,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
