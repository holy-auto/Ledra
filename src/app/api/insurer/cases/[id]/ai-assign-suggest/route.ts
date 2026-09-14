/**
 * POST /api/insurer/cases/[id]/ai-assign-suggest
 *
 * 保険会社 case の担当者を AI 提案する。ルール → 過去履歴 → AI → fallback の
 * 順で評価。AI 自動入力ポリシーで `insurer_case.assignee` が manual の場合は
 * 候補リストを返さず、UI 側で手動振り分けに戻すよう促す。
 *
 * 注: テナント設定 (AI ON/OFF) は損保側 insurer_settings ではなく、
 * Ledra 側 tenant_ai_automation_settings の caller.tenantId を参照する設計に
 * していない (insurer に紐づく tenant の概念が無いため)。
 * insurer 用に独立 ON/OFF が必要になったら別途追加。現状は常に有効として
 * ポリシーフィールドのみ chk する。
 */
import { NextRequest } from "next/server";
import { resolveInsurerCaller } from "@/lib/api/insurerAuth";
import { createInsurerScopedAdmin } from "@/lib/supabase/admin";
import { apiOk, apiUnauthorized, apiNotFound, apiInternalError } from "@/lib/api/response";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { suggestCaseAssignees, type CasePriority } from "@/lib/ai/caseAssignSuggest";
import { startAiRouteUsage } from "@/lib/ai/recordRouteUsage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const usage = startAiRouteUsage("/api/insurer/cases/[id]/ai-assign-suggest");
  try {
    const limited = await checkRateLimit(req, "ai");
    if (limited) {
      usage.record({ outcome: "rate_limit" });
      return limited;
    }

    const { id } = await ctx.params;
    if (!id) return apiNotFound("case id is required");

    const caller = await resolveInsurerCaller();
    if (!caller) return apiUnauthorized();

    const { admin, insurerId } = createInsurerScopedAdmin(caller.insurerId);

    const { data: caseRow, error: cErr } = await admin
      .from("insurer_cases")
      .select("id, title, description, status, priority, category")
      .eq("id", id)
      .eq("insurer_id", insurerId)
      .maybeSingle();
    if (cErr) return apiInternalError(cErr, "case ai-assign: load");
    if (!caseRow) return apiNotFound("case not found");

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

    const rules = (rulesRes.data ?? []) as Array<{
      condition_type: string;
      condition_value: string;
      assign_to: string;
      is_active: boolean;
    }>;
    const users = (usersRes.data ?? []) as Array<{ id: string; display_name: string | null }>;
    const history = (historyRes.data ?? []) as Array<{
      category: string | null;
      priority: string | null;
      assigned_to: string | null;
    }>;

    const result = await suggestCaseAssignees({
      category: caseRow.category as string | null,
      priority: ((caseRow.priority as string) || "normal") as CasePriority,
      subject: caseRow.title as string | null,
      body: caseRow.description as string | null,
      history,
      users: users.map((u) => ({ id: u.id, display_name: u.display_name })),
      rules,
    });

    usage.record({
      insurerId: caller.insurerId,
      userId: caller.userId,
      outcome: "ok",
      meta: {
        ai: result.ai,
        candidates: result.candidates.length,
        method: result.candidates[0]?.method ?? null,
      },
    });

    return apiOk({
      candidates: result.candidates,
      ai: result.ai,
    });
  } catch (e: unknown) {
    usage.record({ outcome: "error" });
    return apiInternalError(e, "case ai-assign-suggest");
  }
}
