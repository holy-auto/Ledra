/**
 * 案件 (Job = reservation) の自動タイトル生成。
 *
 * 飛び込み案件は現状 `飛び込み案件 YYYY-MM-DD` の固定文字列で起票される。
 * ここでは車両情報・顧客名・選択メニュー・過去の類似案件を Haiku に渡し、
 * 一行 (20 字以内) の自然なタイトルを返す。
 *
 * 失敗時 (ANTHROPIC_API_KEY 未設定 / モデル例外) は `null` を返し、呼び出し側で
 * 既存のテンプレ命名にフォールバックする (フェイルオープン)。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface JobAutoTitleInput {
  vehicle?: { maker?: string | null; model?: string | null; year?: number | null };
  customerName?: string | null;
  menuItemNames?: string[];
  serviceCategory?: string | null;
  /** 同テナントで直近に起票された案件タイトル (重複避け / 表記合わせ) */
  recentTitles?: string[];
}

const JobAutoTitleSchema = z.object({
  title: z.string().min(1).max(40),
  confidence: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `あなたは自動車施工店の案件管理を支援するアシスタントです。
顧客名・車両・予定メニューから、店舗スタッフが一覧で識別しやすい案件タイトルを 1 つ生成してください。

ルール:
- 全角 20 文字以内 (半角は 30 文字以内)。
- 日付や時刻は含めない (UI 側で別表示するため)。
- 個人を特定しすぎない (姓だけ可、氏名フルは避ける)。
- メニューがあれば短縮形を使う (例: "ガラスコーティング" → "ガラスコート")。
- 過去タイトルとの語彙を揃え、表記揺れを起こさない。
- "案件" "施工" "作業" のような冗長語は不要。
- 改行・絵文字・カッコ書き禁止。
`.trim();

export async function generateJobAutoTitle(input: JobAutoTitleInput): Promise<{
  title: string;
  confidence: number;
} | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = getAnthropicClient();

  const facts: string[] = [];
  if (input.customerName) facts.push(`顧客: ${input.customerName}`);
  if (input.vehicle) {
    const v = [input.vehicle.maker, input.vehicle.model, input.vehicle.year ? `${input.vehicle.year}年` : null]
      .filter(Boolean)
      .join(" ");
    if (v) facts.push(`車両: ${v}`);
  }
  if (input.menuItemNames?.length) facts.push(`メニュー: ${input.menuItemNames.join(", ")}`);
  if (input.serviceCategory) facts.push(`カテゴリ: ${input.serviceCategory}`);
  if (input.recentTitles?.length) {
    facts.push(`過去の同店舗案件タイトル例:\n${input.recentTitles.slice(0, 5).map((t) => `- ${t}`).join("\n")}`);
  }

  if (facts.length === 0) return null;

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `次の情報から案件タイトルを 1 つ生成してください。\n\n${facts.join("\n")}`,
          },
        ],
        output_config: { format: zodOutputFormat(JobAutoTitleSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return null;
    return { title: clipTitle(parsed.title), confidence: parsed.confidence };
  } catch (err) {
    console.error("[jobAutoTitle] generation failed:", err);
    return null;
  }
}

/** 全角換算で 20 文字までに切り詰める (絵文字は弾く)。 */
export function clipTitle(raw: string): string {
  const t = raw
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  // ざっくり全角換算: ASCII を 0.5 文字、それ以外を 1 文字でカウント。
  let total = 0;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    const w = c < 0x80 ? 0.5 : 1;
    if (total + w > 20) {
      cut = i;
      break;
    }
    total += w;
  }
  return t.slice(0, cut);
}
