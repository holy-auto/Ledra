/**
 * LINE のやり取りから「再利用できる FAQ 知識」を抽出する (ナレッジ自動蓄積 / 学習)。
 *
 * スタッフが顧客に返信した会話を入力に、その回答が **将来の他の顧客にも当てはまる
 * 店舗ポリシー/FAQ** を表しているなら、個人情報・一回限りの固有値を除いた汎用 Q&A に
 * 一般化して返す。個別対応・雑談・特定顧客のスケジュール調整など再利用できないやり取りは
 * reusable=false を返す。
 *
 * replyDraft.ts と同じ流儀: ANTHROPIC_API_KEY 不在や失敗時は safe default (null 相当) を
 * 返し、呼び出し側は壊れない。生成物はそのまま公開せず、呼び出し側で enabled=false の
 * 「レビュー待ち」として保存する前提 (人の承認を経てから Bot が使う)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { wrapUntrusted, untrustedNotice } from "@/lib/ai/promptSafety";
import type { ReplyDraftTurn } from "@/lib/ai/replyDraft";

export interface KnowledgeCandidate {
  /** 質問/トピック (例: "コーティングの施工時間")。 */
  title: string;
  /** 汎用化した回答本文 (敬体・個人情報や固有値を含まない)。 */
  content: string;
  /** 再利用できる FAQ か。false なら保存しない。 */
  reusable: boolean;
  /** 0.0〜1.0 の自己評価。 */
  confidence: number;
  /** AI 実行できたか (キー不在/失敗時 false)。 */
  ai: boolean;
}

const ResultSchema = z.object({
  reusable: z.boolean(),
  title: z.string().max(60),
  content: z.string().max(600),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車施工店 (コーティング / PPF / 板金 等) のナレッジ管理担当です。
LINE でのお客様とのやり取りを読み、店舗スタッフの回答が「将来の他のお客様にも当てはまる
再利用可能な FAQ / 店舗ポリシー」を含むかどうかを判定し、含むなら汎用的な Q&A に一般化します。

reusable=true にするのは、回答が次のような一般知識のとき:
- 営業時間・定休日・所在地・支払方法・対応車種などの店舗情報
- 施工メニューの一般的な内容・所要時間の目安・保証や注意事項
- 「〜はできますか？」への可否や条件の一般的な回答

reusable=false にするのは (この場合 title/content は空でよい):
- 特定のお客様個人の予約日時・見積り金額・車両の個別事情に依存する回答
- 雑談・挨拶・お礼のみ、質問の無いやり取り
- 「確認して折り返します」等、知識を含まない一時的な返答
- スタッフの回答が曖昧・不完全で、そのまま他のお客様に出すと誤解を招くもの

一般化 (reusable=true のとき) のルール:
- **個人情報・固有値は必ず除去する**: 氏名・電話番号・住所・ナンバー・具体的な予約日時・
  特定車両名や特定金額 (一般的な料金体系の説明は可)。
- title: トピックを 30 字以内で (例: "代車の貸出について")。
- content: 敬体 (です/ます) で 300 字程度。他のお客様にもそのまま送れる中立的な説明にする。
  会話の言い回しをそのまま引き写さず、店舗の一般方針として書き直す。
- 会話から確実に読み取れる範囲だけを書く。推測で情報を補わない。

confidence: 一般化の確からしさ (会話が明瞭で汎用知識として確立できるほど高く)。

${untrustedNotice("会話履歴")}`.trim();

const EMPTY: KnowledgeCandidate = { title: "", content: "", reusable: false, confidence: 0, ai: false };

export interface KnowledgeCaptureInput {
  /** スレッド直近のやり取り (古い順)。末尾付近にスタッフの回答が含まれる想定。 */
  turns: ReplyDraftTurn[];
  shopName?: string | null;
}

/**
 * 会話から汎用 FAQ 候補を 1 件抽出する。再利用できない/生成不能なら reusable=false を返す。
 */
export async function generateKnowledgeCandidate(
  input: KnowledgeCaptureInput,
  opts?: { model?: string },
): Promise<KnowledgeCandidate> {
  const hasInbound = input.turns.some((t) => t.direction === "inbound" && t.body.trim().length > 0);
  const hasOutbound = input.turns.some((t) => t.direction === "outbound" && t.body.trim().length > 0);
  // 顧客の質問とスタッフの回答が両方無ければ Q&A を作れない。
  if (!hasInbound || !hasOutbound) return EMPTY;
  if (!process.env.ANTHROPIC_API_KEY) return EMPTY;

  const client = getAnthropicClient();
  const facts: string[] = [];
  if (input.shopName) facts.push(`店舗: ${input.shopName}`);
  const recent = input.turns.slice(-12);
  const convoFull = recent.map((t) => `${t.direction === "inbound" ? "顧客" : "店舗"}: ${t.body.trim()}`).join("\n");
  const MAX_CONVO = 6000;
  const convo = convoFull.length > MAX_CONVO ? convoFull.slice(-MAX_CONVO) : convoFull;
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
    // 本文が空なら再利用不可扱い (title だけでは知識にならない)。
    if (!parsed.reusable || !parsed.content.trim()) {
      return { ...EMPTY, ai: true };
    }
    return {
      title: parsed.title.trim(),
      content: parsed.content.trim(),
      reusable: true,
      confidence: parsed.confidence,
      ai: true,
    };
  } catch (err) {
    console.error("[knowledgeCapture] failed:", err);
    return EMPTY;
  }
}
