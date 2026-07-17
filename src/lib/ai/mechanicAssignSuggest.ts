/**
 * 整備ジョブ (予約) の担当メカニック自動振り分け予測。
 *
 * 保険案件の `caseAssignSuggest.ts` と同じ 3 段構えを、整備側の staff_members
 * (スキルタグ) 向けに焼き直したもの。既存の `src/lib/staff/skills.ts`
 * (inferJobSkillTags / skillMatchScore) を再利用し、二重にスキル辞書を持たない。
 *
 *   1. スキルマッチ: 予約タイトル + メニューから必要スキルを推定し、
 *      staff_members.skills との一致数が最大の職人を候補にする (deterministic)。
 *   2. スキルで差がつかない / 一致ゼロ: 過去の同 service_type 担当履歴の頻度で推定。
 *   3. それでも決まらない: AI に「ジョブ内容と各職人のスキルから最適な担当」を選ばせる。
 *
 * 戻り値は提案のみ。割当 (reservations.assigned_staff_id の確定) は人が行う。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { inferJobSkillTags, skillMatchScore } from "@/lib/staff/skills";

export interface MechanicStaff {
  id: string;
  name: string;
  skills: string[];
  is_active: boolean;
}

/** 過去の担当実績 (同 service_type の割当履歴)。頻度推定に使う。 */
export interface MechanicAssignHistoryRow {
  service_type: string | null;
  assigned_staff_id: string | null;
}

export interface MechanicAssignInput {
  /** 予約タイトル + メニュー名を連結したジョブ説明テキスト。 */
  jobText: string | null;
  /** ワークフロー由来の service_type (coating/ppf/...)。分かれば渡す。 */
  serviceType: string | null;
  staff: MechanicStaff[];
  history: MechanicAssignHistoryRow[];
}

export type MechanicAssignMethod = "skill" | "history" | "ai" | "fallback";

export interface MechanicAssignSuggestion {
  staff_id: string;
  staff_name: string;
  score: number;
  method: MechanicAssignMethod;
  reason: string;
}

export interface MechanicAssignResult {
  candidates: MechanicAssignSuggestion[];
  /** AI フォールバックを使ったか。 */
  ai: boolean;
  /** 推定した service_type (UI 表示・監査用)。 */
  serviceType: string | null;
  /** ジョブから推定した必要スキルタグ。 */
  jobTags: string[];
}

const AiAssignSchema = z.object({
  ranked: z.array(z.object({ staff_id: z.string(), reason: z.string().max(140) })).max(5),
  confidence: z.number().min(0).max(1),
});

const AI_SYSTEM_PROMPT = `あなたは自動車整備工場の配車を支援するアシスタントです。
ジョブ (施工内容) と、各職人の得意スキルを見て、最も適切な担当者を最大 3 名 ranked 順に提案してください。
- 与えられた staff_id の中から選ぶこと (id の捏造は禁止)
- スキルが一致しない職人は順位を下げる
- reason は 60 字以内、なぜその人かを 1 文で日本語で`.trim();

/**
 * 担当メカニック候補を最大 3 名返す。純ロジック (AI 段のみ Anthropic を呼ぶ)。
 * 稼働中 (is_active) の職人だけを対象にする。
 */
export async function suggestMechanicAssignees(
  input: MechanicAssignInput,
  opts?: { model?: string },
): Promise<MechanicAssignResult> {
  const active = input.staff.filter((s) => s.is_active);
  const jobTags = inferJobSkillTags(input.jobText, input.serviceType);
  const staffById = new Map(active.map((s) => [s.id, s]));

  const base = { ai: false, serviceType: input.serviceType, jobTags };
  if (active.length === 0) return { candidates: [], ...base };

  // 1. スキルマッチ (一致数の多い順)。1 件でも一致があればこれを採る。
  const scored = active
    .map((s) => ({ staff: s, score: skillMatchScore(s.skills, jobTags) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) {
    const top = scored[0].score;
    const candidates: MechanicAssignSuggestion[] = scored.slice(0, 3).map((x) => ({
      staff_id: x.staff.id,
      staff_name: x.staff.name,
      // 最上位を 1.0 とし一致数比で相対化。
      score: x.score / top,
      method: "skill",
      reason: `必要スキル (${jobTags.join("/") || "施工内容"}) に ${x.score} 件一致`,
    }));
    return { candidates, ...base };
  }

  // 2. スキル一致ゼロ: 過去の同 service_type 担当頻度で推定。
  if (input.serviceType) {
    const tally = new Map<string, number>();
    for (const h of input.history) {
      if (!h.assigned_staff_id) continue;
      if (h.service_type !== input.serviceType) continue;
      if (!staffById.has(h.assigned_staff_id)) continue; // 退職 / 非稼働は除外
      tally.set(h.assigned_staff_id, (tally.get(h.assigned_staff_id) ?? 0) + 1);
    }
    const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (sorted.length > 0) {
      const total = sorted.reduce((sum, [, n]) => sum + n, 0);
      const candidates: MechanicAssignSuggestion[] = sorted.map(([staffId, count]) => {
        const s = staffById.get(staffId)!;
        return {
          staff_id: s.id,
          staff_name: s.name,
          score: count / total,
          method: "history",
          reason: `過去 ${count} 件の同種施工 (${input.serviceType}) を担当`,
        };
      });
      return { candidates, ...base };
    }
  }

  // 3. AI フォールバック (スキルも履歴も決め手が無いとき)。
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = getAnthropicClient();
      const staffList = active
        .slice(0, 30)
        .map((s) => `- id=${s.id} name=${s.name} skills=${s.skills.join(",") || "(未設定)"}`)
        .join("\n");
      const msg = await withRetry("anthropic", () =>
        client.messages.parse({
          model: opts?.model ?? AI_MODEL_FAST,
          max_tokens: 768,
          system: AI_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `ジョブ内容: ${input.jobText ?? "(不明)"}\nservice_type: ${input.serviceType ?? "(不明)"}\n\n職人一覧:\n${staffList}`,
            },
          ],
          output_config: { format: zodOutputFormat(AiAssignSchema) },
        }),
      );
      const parsed = msg.parsed_output;
      if (parsed) {
        const candidates: MechanicAssignSuggestion[] = [];
        for (let i = 0; i < parsed.ranked.length; i++) {
          const r = parsed.ranked[i];
          const s = staffById.get(r.staff_id);
          if (!s) continue;
          candidates.push({
            staff_id: s.id,
            staff_name: s.name,
            score: Math.max(0, 1 - i * 0.15),
            method: "ai",
            reason: r.reason,
          });
        }
        if (candidates.length > 0) return { candidates, ...base, ai: true };
      }
    } catch (err) {
      console.error("[mechanicAssignSuggest] AI fallback failed:", err);
    }
  }

  // 4. 完全フォールバック: 稼働中の先頭職人を暫定提案。
  const first = active[0];
  return {
    candidates: [
      {
        staff_id: first.id,
        staff_name: first.name,
        score: 0.1,
        method: "fallback",
        reason: "スキル / 履歴に決め手なし、稼働中の職人を暫定提案",
      },
    ],
    ...base,
  };
}
