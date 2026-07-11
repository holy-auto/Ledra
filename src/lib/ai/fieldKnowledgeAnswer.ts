/**
 * 現場スタッフの質問 → 店舗の施工ナレッジ (tenant_field_knowledge) のみを根拠にした回答。
 *
 * knowledgeReply (LINE 顧客向け) のスタッフ版。技術者が登録した施工の勘所
 * (車種別注意点・配線ルート・クレーム事例) を回答ソースに与え、「ナレッジだけで
 * 答えられるか」の判定と回答生成を 1 回の呼び出しで行う。ナレッジに無い内容は
 * can_answer=false で返し、答えられる範囲でも不明部分は「確認が必要」とさせる —
 * AI がナレッジ外の答えを創作する事故をモデル指示 + 判定フラグの二段で防ぐ
 * (CLAUDE.md「AI は事実を作ってはいけない」)。
 *
 * AI が使えない場合 (API キー未設定・タイムアウト等) は can_answer=false /
 * ai=false のフォールバックを返す。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { untrustedNotice } from "@/lib/ai/promptSafety";
import { wrapUntrustedBody } from "@/lib/ai/inboundReservationExtract";
import { renderKnowledgeBlock, type KnowledgeEntry } from "@/lib/ai/knowledgeReply";

/**
 * プロンプトに注入する施工ナレッジの上限。登録上限 (API 側) と一致させ、
 * 「登録したのに参照されない」エントリを作らない。
 * ponytail: 検索 (RAG) はせず enabled 全件を注入する。1 件 ≤2,000 字 (DB CHECK)
 * なので 60 件でも実用範囲。数百件規模に育ったら pgvector で事前絞り込みに移行する
 * (knowledgeReply と同じアップグレードパス)。
 */
export const FIELD_KNOWLEDGE_LIMIT = 60;

export interface FieldKnowledgeAnswerInput {
  /** スタッフの質問原文。 */
  question: string;
  /** 回答ソースにする施工ナレッジ (enabled のみ)。 */
  knowledge: KnowledgeEntry[];
  /** 店舗名 (回答トーン用)。 */
  tenantName?: string | null;
}

export interface FieldKnowledgeAnswerResult {
  /** ナレッジのみで回答できると AI が判断したか。false なら回答文なし。 */
  can_answer: boolean;
  /** スタッフに見せる回答 (can_answer=true のときのみ)。 */
  answer?: string;
  confidence: number;
  ai: boolean;
}

const AnswerSchema = z.object({
  can_answer: z.boolean(),
  answer: z.string().max(1500).optional(),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車施工店の現場スタッフを補佐するアシスタントです。
スタッフの質問に、店舗に登録された「施工ナレッジ」だけを根拠に答えてください。

最重要ルール (逸脱禁止):
- 回答の根拠にしてよいのは <施工ナレッジ> の内容**のみ**。一般知識・推測で答えてはならない。
- ナレッジから確実に答えられない質問は can_answer=false にする (answer は不要)。
  部分的に答えられる場合は、答えられる部分だけで自然な回答にし、
  不明な部分は「登録記録には無いため確認が必要」と明記する (創作して埋めない)。
- 数値 (作業時間・トルク・部品番号・配線位置等) はナレッジに明記されている場合のみ、
  その記載どおりに伝える。

回答スタイル:
- 現場で役立つ簡潔な日本語。要点から述べる。
- 該当ナレッジが複数あればまとめて答えてよい。

confidence: ナレッジが質問に合致している度合いを 0.0〜1.0 で自己評価。
質問とナレッジの対応が曖昧なら低めに付ける。

${untrustedNotice("質問文")}`.trim();

export async function answerFieldKnowledge(
  input: FieldKnowledgeAnswerInput,
  opts?: { model?: string },
): Promise<FieldKnowledgeAnswerResult> {
  const fallback: FieldKnowledgeAnswerResult = { can_answer: false, confidence: 0, ai: false };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  if (!input.question.trim() || input.knowledge.length === 0) return fallback;

  const client = getAnthropicClient();
  const meta = input.tenantName?.trim() ? `店舗名: ${input.tenantName.trim()}\n\n` : "";

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${meta}${renderKnowledgeBlock(input.knowledge, "施工ナレッジ")}質問:\n${wrapUntrustedBody(input.question)}`,
          },
        ],
        output_config: { format: zodOutputFormat(AnswerSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return fallback;
    return { ...parsed, ai: true };
  } catch (err) {
    console.error("[fieldKnowledgeAnswer] failed:", err);
    return fallback;
  }
}
