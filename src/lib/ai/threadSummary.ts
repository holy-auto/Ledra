/**
 * LINE 会話スレッドの引き継ぎ用サマリ生成。
 *
 * 受信箱 (/admin/messages) で、担当外のスタッフでも会話の文脈を素早く把握して
 * 途中から対応できるよう、直近のやり取りを「用件・経緯・未対応・次の一手」に要約する。
 * 送信は伴わない (読むための内部要約)。
 *
 * replyDraft.ts と同じ流儀: ANTHROPIC_API_KEY 不在や失敗時は safe default (空) を返し、
 * 呼び出し側は壊れない。要約は社内向け (顧客には送らない) なので氏名・車両等は含めてよい。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { wrapUntrusted, untrustedNotice } from "@/lib/ai/promptSafety";
import type { ReplyDraftTurn } from "@/lib/ai/replyDraft";

export interface ThreadSummaryInput {
  turns: ReplyDraftTurn[];
  customerName?: string | null;
  shopName?: string | null;
  vehicle?: string | null;
}

export interface ThreadSummaryResult {
  /** 用件・経緯・状況の要約 (数行)。 */
  summary: string;
  /** 次に取るべき一手 (1行)。無ければ空文字。 */
  next_action: string;
  ai: boolean;
}

const ResultSchema = z.object({
  summary: z.string().max(1000),
  next_action: z.string().max(300),
});

const SYSTEM_PROMPT = `あなたは自動車施工店 (コーティング / PPF / 板金 等) の顧客対応リーダーです。
LINE の会話を、**担当外のスタッフが読んで即座に引き継げるよう**に要約してください。

summary (要約) のルール:
- 200〜400 字程度、敬体は不要 (社内メモ調)。箇条書き可。
- 次を必ず押さえる: ①お客様の用件 (何を求めているか) ②これまでの経緯・決まったこと
  ③未対応・確認待ちの事項。
- 会話から確実に読み取れることだけを書く。推測で事実を補わない。曖昧な点は「未確認」と書く。
- 個別の金額・日時・車両・氏名は要約に含めてよい (社内向け。顧客には送らない)。

next_action (次の一手): スタッフが次に取るべき行動を1行で。特に無ければ空文字。

${untrustedNotice("会話履歴")}`.trim();

const EMPTY: ThreadSummaryResult = { summary: "", next_action: "", ai: false };

export async function generateThreadSummary(
  input: ThreadSummaryInput,
  opts?: { model?: string },
): Promise<ThreadSummaryResult> {
  // 会話が無ければ要約しない。
  if (!input.turns.some((t) => t.body.trim().length > 0)) return EMPTY;
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY;

  const client = getAnthropicClient();
  const facts: string[] = [];
  if (input.shopName) facts.push(`店舗: ${input.shopName}`);
  if (input.customerName) facts.push(`顧客名: ${input.customerName}`);
  if (input.vehicle?.trim()) facts.push(`お客様の登録車両: ${input.vehicle.trim()}`);
  // 引き継ぎ用途では会話全体像が要るので直近 30 ターンまで見る。
  const recent = input.turns.slice(-30);
  const convoFull = recent.map((t) => `${t.direction === "inbound" ? "顧客" : "店舗"}: ${t.body.trim()}`).join("\n");
  const MAX_CONVO = 8000;
  // 超過時は末尾だけ残すと「用件・経緯」(会話冒頭) が落ちるので、冒頭と末尾の両方を残して
  // 中間を省く (要約は冒頭の用件と直近の状況の両方が要るため)。
  const convo =
    convoFull.length <= MAX_CONVO
      ? convoFull
      : `${convoFull.slice(0, Math.floor(MAX_CONVO * 0.6))}\n…（中略）…\n${convoFull.slice(-Math.floor(MAX_CONVO * 0.4))}`;
  facts.push(`会話 (古い順):\n${wrapUntrusted(convo, { tag: "会話履歴", maxLen: MAX_CONVO })}`);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.join("\n\n") }],
        output_config: { format: zodOutputFormat(ResultSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed || !parsed.summary.trim()) return EMPTY;
    return { summary: parsed.summary.trim(), next_action: parsed.next_action.trim(), ai: true };
  } catch (err) {
    console.error("[threadSummary] failed:", err);
    return EMPTY;
  }
}
