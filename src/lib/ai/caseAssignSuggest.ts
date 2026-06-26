/**
 * 保険会社案件 (insurer_cases) の担当者自動振り分け予測。
 *
 * `insurer_assignment_rules` (rule-based) と「過去案件のアサインパターン」を
 * 組み合わせて、最有力候補を 1〜3 名返す。
 *
 * - rule hit があれば最優先 (deterministic、confidence=1.0)
 * - rule miss は過去 30 件の (category, priority) × assigned_to の頻度から推定
 * - 候補が全くいなければ AI に「テキストとカテゴリから担当領域を判定させる」
 *   フォールバックを 1 段噛ます
 *
 * 戻り値はそのまま PATCH /api/insurer/cases に流せる assigned_to 候補リスト。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type CasePriority = "low" | "normal" | "high" | "urgent";

export interface CaseAssignRule {
  condition_type: string;
  condition_value: string;
  assign_to: string;
  is_active: boolean;
}

export interface CaseAssignHistoryRow {
  category: string | null;
  priority: string | null;
  assigned_to: string | null;
}

export interface User {
  id: string;
  display_name?: string | null;
  /** カテゴリ別の得意領域タグ (admin 設定) */
  specialty_tags?: string[];
}

export interface CaseAssignInput {
  category: string | null;
  priority: CasePriority;
  subject?: string | null;
  body?: string | null;
  history: CaseAssignHistoryRow[];
  users: User[];
  rules: CaseAssignRule[];
}

export interface CaseAssignSuggestion {
  user_id: string;
  user_name?: string;
  score: number;
  method: "rule" | "history" | "ai" | "fallback";
  reason: string;
}

const AiAssignSchema = z.object({
  ranked: z.array(z.object({ user_id: z.string(), reason: z.string().max(140) })).max(5),
  confidence: z.number().min(0).max(1),
});

export interface CaseAssignResult {
  candidates: CaseAssignSuggestion[];
  ai: boolean;
}

export async function suggestCaseAssignees(
  input: CaseAssignInput,
  opts?: { model?: string },
): Promise<CaseAssignResult> {
  const userById = new Map(input.users.map((u) => [u.id, u]));

  // 1. ルールベース hit
  for (const r of input.rules) {
    if (!r.is_active) continue;
    if (matchesRule(r, input)) {
      const u = userById.get(r.assign_to);
      if (u) {
        return {
          candidates: [
            {
              user_id: u.id,
              user_name: u.display_name ?? undefined,
              score: 1.0,
              method: "rule",
              reason: `振り分けルール (${r.condition_type}=${r.condition_value}) に一致`,
            },
          ],
          ai: false,
        };
      }
    }
  }

  // 2. 過去アサイン頻度
  const tally = new Map<string, number>();
  for (const h of input.history) {
    if (!h.assigned_to) continue;
    if (h.category !== input.category && h.priority !== input.priority) continue;
    tally.set(h.assigned_to, (tally.get(h.assigned_to) ?? 0) + 1);
  }
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (sorted.length > 0) {
    const total = sorted.reduce((s, [, n]) => s + n, 0);
    const candidates: CaseAssignSuggestion[] = [];
    for (const [userId, count] of sorted) {
      const u = userById.get(userId);
      if (!u) continue;
      candidates.push({
        user_id: u.id,
        user_name: u.display_name ?? undefined,
        score: count / total,
        method: "history",
        reason: `過去 ${count} 件の同カテゴリ・同優先度案件を担当`,
      });
    }
    return { candidates, ai: false };
  }

  // 3. AI で specialty_tags を参照しつつ判定
  if (!process.env.ANTHROPIC_API_KEY || input.users.length === 0) {
    // 4. 完全フォールバック: 先頭ユーザーを返すだけ
    const first = input.users[0];
    if (!first) return { candidates: [], ai: false };
    return {
      candidates: [
        {
          user_id: first.id,
          user_name: first.display_name ?? undefined,
          score: 0.1,
          method: "fallback",
          reason: "履歴 / ルールに該当なし、最初のユーザーを暫定提案",
        },
      ],
      ai: false,
    };
  }

  const client = getAnthropicClient();
  const userList = input.users
    .slice(0, 30)
    .map((u) => `- id=${u.id} name=${u.display_name ?? "(未設定)"} specialty=${(u.specialty_tags ?? []).join(",")}`)
    .join("\n");

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 768,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `カテゴリ: ${input.category ?? "(不明)"}\n優先度: ${input.priority}\n件名: ${input.subject ?? ""}\n本文要約:\n${(input.body ?? "").slice(0, 1500)}\n\n候補ユーザー:\n${userList}`,
          },
        ],
        output_config: { format: zodOutputFormat(AiAssignSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) {
      const first = input.users[0];
      return {
        candidates: first ? [{ user_id: first.id, score: 0.1, method: "fallback", reason: "AI 応答失敗" }] : [],
        ai: false,
      };
    }
    const candidates: CaseAssignSuggestion[] = [];
    for (let i = 0; i < parsed.ranked.length; i++) {
      const r = parsed.ranked[i];
      const u = userById.get(r.user_id);
      if (!u) continue;
      candidates.push({
        user_id: u.id,
        user_name: u.display_name ?? undefined,
        score: Math.max(0, 1 - i * 0.15),
        method: "ai",
        reason: r.reason,
      });
    }
    return { candidates, ai: true };
  } catch (err) {
    console.error("[caseAssignSuggest] failed:", err);
    const first = input.users[0];
    return {
      candidates: first ? [{ user_id: first.id, score: 0.1, method: "fallback", reason: "AI 例外、暫定提案" }] : [],
      ai: false,
    };
  }
}

const SYSTEM_PROMPT = `あなたは保険会社の案件管理を支援するアシスタントです。
案件のカテゴリ・優先度・本文と、候補ユーザーの specialty_tags を見て、
最も適切な担当者を最大 3 名 ranked 順に提案してください。
- 与えられたユーザー id の中から選ぶこと (id 捏造禁止)
- specialty が一致しない場合は順位を下げる
- reason は 60 字以内、なぜその人かを 1 文で`.trim();

function matchesRule(rule: CaseAssignRule, input: CaseAssignInput): boolean {
  const v = rule.condition_value.toLowerCase();
  switch (rule.condition_type) {
    case "category":
      return input.category?.toLowerCase() === v;
    case "priority":
      return input.priority.toLowerCase() === v;
    case "subject_contains":
      return (input.subject ?? "").toLowerCase().includes(v);
    case "body_contains":
      return (input.body ?? "").toLowerCase().includes(v);
    default:
      return false;
  }
}
