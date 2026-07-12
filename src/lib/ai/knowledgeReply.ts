/**
 * 受信メッセージ (一般質問) → 店舗ナレッジのみを根拠にした LINE 返信文の生成。
 *
 * テナント管理者が登録したナレッジ (tenant_line_knowledge) を回答ソースとして
 * 与え、「ナレッジだけで回答できるか」の判定と返信文の生成を 1 回の呼び出しで
 * 行う。ナレッジに無い内容は can_answer=false で返し、呼び出し側 (IO 層) は
 * 返信せずスタッフ対応に残す — AI がナレッジ外の答えを創作して顧客に送る事故を
 * モデル指示 + 判定フラグの二段で防ぐ。
 *
 * AI が使えない場合 (API キー未設定・タイムアウト等) は can_answer=false /
 * ai=false のフォールバックを返す (呼び出し側は何も送らない)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { untrustedNotice } from "@/lib/ai/promptSafety";
import { renderHistory, wrapUntrustedBody, type InboundHistoryTurn } from "@/lib/ai/inboundReservationExtract";

export interface KnowledgeEntry {
  /** 質問 / トピック (例: "営業時間")。任意 — 空欄なら content だけを注入する。 */
  title: string;
  /** 回答 / 知識本文 */
  content: string;
}

/**
 * プロンプトに注入する店舗ナレッジの上限件数。登録上限 (API 側) と回答に使う
 * 件数を一致させ、「登録したのに参照されない」エントリを作らないための単一定義。
 */
export const KNOWLEDGE_LIMIT = 50;
/** 全テナント共有ナレッジの注入上限 (運営管理・global_line_knowledge)。 */
export const SHARED_KNOWLEDGE_LIMIT = 30;

export interface KnowledgeReplyInput {
  /** 最新の受信メッセージ原文。 */
  text: string;
  /** 回答ソースにする店舗ナレッジ (enabled のみ)。 */
  knowledge: KnowledgeEntry[];
  /** 全テナント共有ナレッジ (運営管理・enabled のみ)。店舗ナレッジと矛盾時は店舗優先。 */
  sharedKnowledge?: KnowledgeEntry[];
  /** 会話文脈 (古い順)。指示語 (「それは？」等) の解釈に使う。 */
  history?: InboundHistoryTurn[];
  /** 店舗名 (返信文のトーン用)。 */
  tenantName?: string | null;
}

export interface KnowledgeReplyResult {
  /** ナレッジのみで回答できると AI が判断したか。false なら返信しない。 */
  can_answer: boolean;
  /** 顧客に送る返信文 (can_answer=true のときのみ)。 */
  reply?: string;
  confidence: number;
  ai: boolean;
}

const ReplySchema = z.object({
  can_answer: z.boolean(),
  reply: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車施工店の LINE 公式アカウントの受付担当です。
顧客からの受信メッセージに対し、「店舗ナレッジ」だけを根拠に返信文を作ってください。

最重要ルール (逸脱禁止):
- 回答の根拠にしてよいのは <共通ナレッジ> と <店舗ナレッジ> の内容**のみ**。一般知識・推測で答えてはならない。
- <共通ナレッジ> は全店舗共通の参考情報、<店舗ナレッジ> はこの店舗固有の情報。
  両者の内容が矛盾する場合は必ず <店舗ナレッジ> を優先する。
- ナレッジから確実に答えられない質問は can_answer=false にする (reply は不要)。
  部分的にしか答えられない場合も、答えられる部分だけで自然な返信になるなら can_answer=true でよいが、
  ナレッジに無い部分を創作して埋めてはならない。
- 金額・納期は、ナレッジに明記されている場合のみ、その記載どおりに伝える。
- 予約の確定・変更・キャンセルの完了を伝えてはならない (それらはスタッフが行う)。
- 雑談・挨拶のみ (質問が無い) のメッセージは can_answer=false。

返信文のスタイル:
- 丁寧で親しみやすい日本語。LINE のメッセージとして自然な長さ (目安 300 文字以内)。
- 顧客の質問に直接答えることから始める。署名・店舗名の名乗りは不要。
- 必要なら「詳しくはスタッフが折り返しご連絡します」と締めてよい。

confidence: ナレッジが質問に合致している度合いを 0.0〜1.0 で自己評価。
質問とナレッジの対応が曖昧なら低めに付ける。

${untrustedNotice("受信本文")}`.trim();

/**
 * ナレッジをプロンプト用のブロックに整形する。空フィルタは IO 層 (knowledgeReplyAuto)
 * が済ませている前提。空配列ならブロック自体を出さない ("" を返す)。
 *
 * ponytail: 検索 (RAG) はせず enabled 全件をそのまま注入する。件数は IO 層で
 * 制限しており、1 件 ≤2,200 字 (DB CHECK) なので最悪でも実用範囲。
 * ナレッジが数百件規模になったら pgvector 等での事前絞り込みに移行する。
 */
export function renderKnowledgeBlock(knowledge: KnowledgeEntry[], tag: string): string {
  if (knowledge.length === 0) return "";
  // title は任意。Q&A なら「1. 質問 改行 回答」、自由文なら「1. 本文」だけを出す
  // (空タイトルで見出し行が空になり本文の意味が崩れるのを防ぐ)。
  const lines = knowledge.map((k, i) => {
    const title = k.title.trim();
    const content = k.content.trim();
    return title ? `${i + 1}. ${title}\n${content}` : `${i + 1}. ${content}`;
  });
  return `<${tag}>\n${lines.join("\n\n")}\n</${tag}>\n\n`;
}

export async function generateKnowledgeReply(
  input: KnowledgeReplyInput,
  opts?: { model?: string },
): Promise<KnowledgeReplyResult> {
  const fallback: KnowledgeReplyResult = { can_answer: false, confidence: 0, ai: false };
  if (!process.env.ANTHROPIC_API_KEY) return fallback;
  const shared = input.sharedKnowledge ?? [];
  if (!input.text.trim() || input.knowledge.length + shared.length === 0) return fallback;

  const client = getAnthropicClient();
  const meta = input.tenantName?.trim() ? `店舗名: ${input.tenantName.trim()}\n\n` : "";

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 768,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `${meta}${renderKnowledgeBlock(shared, "共通ナレッジ")}${renderKnowledgeBlock(input.knowledge, "店舗ナレッジ")}${renderHistory(input.history)}最新の受信メッセージ:\n${wrapUntrustedBody(input.text)}`,
          },
        ],
        output_config: { format: zodOutputFormat(ReplySchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return fallback;
    return { ...parsed, ai: true };
  } catch (err) {
    console.error("[knowledgeReply] failed:", err);
    return fallback;
  }
}
