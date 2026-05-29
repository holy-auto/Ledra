/**
 * 保険会社案件 (insurer_cases) の 3 行サマリ生成。
 *
 * 査定担当が「この case の要点を 3 秒で把握したい」とき向け。
 * 案件の subject / body / 添付メモから:
 *   1. 何の案件か (車両 + 施工 + 主訴)
 *   2. 進行状況 (status / 直近のやりとり)
 *   3. 次にすべきこと
 * の 3 行 (各 50 字以内) を返す。
 *
 * 失敗時は本文の先頭 1 行をそのまま返すだけのフォールバック。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface CaseSummaryInput {
  subject?: string | null;
  body?: string | null;
  status: string;
  priority: string;
  vehicle?: { maker?: string | null; model?: string | null } | null;
  certificate?: { service_name?: string | null; issued_at?: string | null } | null;
  /** 直近のメッセージ (やりとり) 1〜3 件 */
  recentMessages?: Array<{ author: string; body: string; created_at: string }>;
}

const SummarySchema = z.object({
  line1: z.string().max(120),
  line2: z.string().max(120),
  line3: z.string().max(120),
  confidence: z.number().min(0).max(1),
});

export interface CaseSummaryResult {
  lines: [string, string, string];
  confidence: number;
  ai: boolean;
}

const SYSTEM_PROMPT = `あなたは損保会社の査定担当を支援するアシスタントです。
案件情報を 3 行で要約してください。

各行の役割:
- line1: 案件の本質 (誰の・何の車両・何の施工・主訴は何か)
- line2: 進行状況 (現在のステータス / 直近のやりとり)
- line3: 次にすべきこと (担当者が今やる作業)

ルール:
- 各行 50 字以内、句点 (。) で終える
- 推測表現禁止、事実だけ述べる
- 改行 / 絵文字 / カッコ書き禁止
- 案件情報に無いことは line に書かない`.trim();

export async function summarizeCase(input: CaseSummaryInput): Promise<CaseSummaryResult> {
  const fallback = buildFallbackLines(input);
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const client = getAnthropicClient();
  const facts: string[] = [
    `ステータス: ${input.status}`,
    `優先度: ${input.priority}`,
  ];
  if (input.subject) facts.push(`件名: ${input.subject}`);
  if (input.vehicle) {
    facts.push(`車両: ${[input.vehicle.maker, input.vehicle.model].filter(Boolean).join(" ")}`);
  }
  if (input.certificate) {
    facts.push(
      `施工: ${input.certificate.service_name ?? "(不明)"} / 発行日 ${input.certificate.issued_at ?? "(不明)"}`,
    );
  }
  if (input.body) facts.push(`本文:\n${input.body.slice(0, 2000)}`);
  if (input.recentMessages && input.recentMessages.length > 0) {
    facts.push(
      `直近やりとり:\n${input.recentMessages
        .slice(0, 3)
        .map((m) => `- [${m.created_at}] ${m.author}: ${m.body.slice(0, 200)}`)
        .join("\n")}`,
    );
  }

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(SummarySchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return fallback;
    return {
      lines: [parsed.line1, parsed.line2, parsed.line3],
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[caseSummary] failed:", err);
    return fallback;
  }
}

export function buildFallbackLines(input: CaseSummaryInput): CaseSummaryResult {
  const veh = [input.vehicle?.maker, input.vehicle?.model].filter(Boolean).join(" ");
  const line1 = input.subject ? clip(input.subject, 50) + "。" : veh ? `${veh} の案件。` : "案件詳細未取得。";
  const line2 = `現在ステータス: ${input.status} (${input.priority})。`;
  const line3 = "本文を確認してください。";
  return { lines: [line1, line2, line3], confidence: 0.2, ai: false };
}

function clip(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen);
}
