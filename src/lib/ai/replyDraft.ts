/**
 * LINE 会話への返信ドラフト生成。
 *
 * 受信箱 (/admin/messages) で、顧客とのスレッド直近のやり取りを文脈に、
 * スタッフ向けの返信文を 1 件下書きする。送信は必ず人が行う前提
 * (このモジュールは文章を返すだけで送信はしない)。
 *
 * inquiryClassify.ts と同じ流儀: ANTHROPIC_API_KEY 不在や失敗時は safe default
 * (空ドラフト) を返し、呼び出し側は壊れない。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { wrapUntrusted, untrustedNotice } from "@/lib/ai/promptSafety";
import type { KnowledgeEntry } from "@/lib/ai/knowledgeReply";

export interface ReplyDraftTurn {
  direction: "inbound" | "outbound";
  body: string;
}

export interface ReplyDraftInput {
  /** スレッド直近のメッセージ (古い順)。最新の inbound に返信する想定。 */
  turns: ReplyDraftTurn[];
  customerName?: string | null;
  shopName?: string | null;
  /** お客様の登録車両 (例: "トヨタ アルファード")。分かれば文脈に添える。 */
  vehicle?: string | null;
  /**
   * 店舗ナレッジ (tenant_line_knowledge の enabled)。回答の最優先の事実根拠。
   * 空なら従来どおり会話文脈のみで下書きする。
   */
  knowledge?: KnowledgeEntry[];
  /** 全テナント共有ナレッジ (global_line_knowledge の enabled)。参考。店舗ナレッジと矛盾時は店舗優先。 */
  sharedKnowledge?: KnowledgeEntry[];
}

export interface ReplyDraftResult {
  draft_reply: string;
  confidence: number;
  ai: boolean;
}

const ResultSchema = z.object({
  draft_reply: z.string().max(800),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車施工店 (コーティング / PPF / 板金 等) の顧客対応スタッフです。
LINE で届いた顧客メッセージへの返信ドラフトを 1 件作成してください。

返信ドラフト (draft_reply) のルール:
- 150〜250 字程度、敬体 (です / ます)
- 直近の顧客メッセージの意図に具体的に応答する
- **「店舗ナレッジ」が与えられている場合は、それを事実の根拠にする**。営業時間・料金体系・
  対応可否・保証などの店舗方針は、ナレッジに書かれている内容に忠実に答える。ナレッジに
  無いことは店舗方針として断定せず、"確認の上、改めてご連絡いたします。" と添える
  (ナレッジを推測で補完しない)。
- 確定情報 (個別の金額・予約日時・在庫の有無) は断定しない。必要なら
  "確認の上、改めてご連絡いたします。" と添える
- 来店予約や見積りの依頼には前向きに、次の一歩を促す
- 絵文字 / 顔文字 / 過度な感嘆符は使わない
- 顧客名が分かっていれば冒頭に「<名前> 様」を付ける
- 署名や店舗名の定型文は付けない (送信時にスタッフが調整する)

confidence: 0.0〜1.0 で、文脈の明瞭さに基づく自己評価。
最新の顧客発言が曖昧・情報不足なら低めにする。ナレッジで根拠づけられた回答ほど高くしてよい。

${untrustedNotice("会話履歴")}`.trim();

/**
 * ナレッジをプロンプトに載せる facts 文字列に整形する (空なら null)。
 * このルートは対話的 (スタッフが下書き生成を待つ) なので、注入量を上限で抑える。
 * 店舗ナレッジ→共通ナレッジの順で予算を割り当て、店舗ナレッジの優先を明示する。
 */
const MAX_KNOWLEDGE_CHARS = 4000;

function renderKnowledgeBlock(
  label: string,
  entries: KnowledgeEntry[] | undefined,
  budget: number,
): { text: string; used: number } | null {
  const usable = (entries ?? []).filter((e) => e.content?.trim());
  if (usable.length === 0) return null;
  const lines: string[] = [];
  let used = 0;
  for (const e of usable) {
    // 複数行の本文は 1 行に畳む (箇条書きが崩れて別の事実に見えるのを防ぐ)。
    const content = e.content.trim().replace(/\s*\n\s*/g, " ");
    const line = e.title?.trim() ? `- ${e.title.trim()}: ${content}` : `- ${content}`;
    if (used + line.length > budget) break; // 予算超過分は載せない (対話的ルートの遅延/コスト抑制)。
    lines.push(line);
    used += line.length;
  }
  if (lines.length === 0) return null;
  return { text: `${label}:\n${lines.join("\n")}`, used };
}

export function knowledgeFacts(
  tenant: KnowledgeEntry[] | undefined,
  shared?: KnowledgeEntry[] | undefined,
): string | null {
  const blocks: string[] = [];
  let budget = MAX_KNOWLEDGE_CHARS;
  const t = renderKnowledgeBlock("店舗ナレッジ (最優先。これに反する内容は書かない)", tenant, budget);
  if (t) {
    blocks.push(t.text);
    budget -= t.used;
  }
  const s = renderKnowledgeBlock("共通ナレッジ (参考。店舗ナレッジと矛盾する場合は店舗ナレッジを優先)", shared, budget);
  if (s) blocks.push(s.text);
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

const EMPTY: ReplyDraftResult = { draft_reply: "", confidence: 0, ai: false };

export async function generateReplyDraft(input: ReplyDraftInput, opts?: { model?: string }): Promise<ReplyDraftResult> {
  // 返信対象 (直近の inbound) が無ければ下書きしない。
  const hasInbound = input.turns.some((t) => t.direction === "inbound" && t.body.trim().length > 0);
  if (!hasInbound) return EMPTY;
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY;

  const client = getAnthropicClient();

  const facts: string[] = [];
  if (input.shopName) facts.push(`店舗: ${input.shopName}`);
  if (input.customerName) facts.push(`顧客名: ${input.customerName}`);
  if (input.vehicle?.trim()) facts.push(`お客様の登録車両: ${input.vehicle.trim()}`);
  // 店舗ナレッジ (LINE 自動返信と同じソース) を回答の根拠として先に載せる。
  const kFacts = knowledgeFacts(input.knowledge, input.sharedKnowledge);
  if (kFacts) facts.push(kFacts);
  // 直近 12 ターンだけ文脈に渡す (長すぎる履歴を避ける)。
  const recent = input.turns.slice(-12);
  const convoFull = recent.map((t) => `${t.direction === "inbound" ? "顧客" : "店舗"}: ${t.body.trim()}`).join("\n");
  // 会話は古い順なので、超過時は**末尾（=返信対象の最新発言）を必ず残す**ため
  // 先頭ではなく後方を優先して切り詰める。
  const MAX_CONVO = 6000;
  const convo = convoFull.length > MAX_CONVO ? convoFull.slice(-MAX_CONVO) : convoFull;
  // 顧客発言は未信頼入力。プロンプトインジェクション対策として明示デリミタで包囲する。
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
    if (!parsed) return EMPTY;
    return { draft_reply: parsed.draft_reply, confidence: parsed.confidence, ai: true };
  } catch (err) {
    console.error("[replyDraft] failed:", err);
    return EMPTY;
  }
}
