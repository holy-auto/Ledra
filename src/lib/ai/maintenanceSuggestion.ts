/**
 * AI 整備提案メッセージ生成。
 *
 * 顧客 + 車両 に対して、deterministic な signals (= service_reminders から導いた
 * 「期限超過 / もうすぐ期限」、施工履歴、走行距離、車齢) だけを LLM に渡し、
 * 顧客へ送るフォローアップメッセージ (件名 + 本文 + 緊急度) を生成する。
 *
 * customerNextAction.ts と同じ「signals で意思決定は確定済み、LLM は文章化だけ」
 * の方針。期限超過の有無 (urgency の素地) は呼び出し側で算出済みのものを渡し、
 * LLM にはハルシネーションさせない。
 *
 * 失敗時 (ANTHROPIC_API_KEY 未設定 / レスポンス壊れ / タイムアウト) は null を
 * 返してフェイルオープン。UI 側は「生成できませんでした」を表示するだけで、
 * 顧客データには一切影響しない。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export interface MaintenanceSuggestionInput {
  customerName: string;
  shopName: string;
  vehicleInfo: {
    maker?: string;
    model?: string;
    year?: number;
    /** km */
    currentMileage?: number;
  };
  dueReminders: Array<{
    service_name: string;
    reminder_type: "mileage" | "interval_months" | "both";
    /** true if past next_due_date or next_due_mileage */
    overdue: boolean;
    /** negative = overdue */
    days_until_due?: number;
    /** negative = overdue */
    km_until_due?: number;
  }>;
  recentCertificates: Array<{
    service_name?: string;
    created_at: string;
  }>;
}

export interface MaintenanceSuggestionResult {
  /** メッセージ件名 (30文字以内) */
  subject: string;
  /** 本文 (200文字以内) */
  body: string;
  urgency: "low" | "medium" | "high";
}

const SuggestionSchema = z.object({
  subject: z.string().min(1).max(60),
  body: z.string().min(1).max(400),
  urgency: z.enum(["low", "medium", "high"]),
});

const SYSTEM_PROMPT =
  `あなたは自動車施工店スタッフ向けのAIアシスタントです。顧客への整備提案メッセージを生成してください。

ルール:
- 渡された事実 (期限超過の項目・施工履歴・走行距離・車齢) だけを根拠にする。事実にない整備項目を作らない (ハルシネーション禁止)。
- subject は30文字以内。本文 (body) は200文字以内。丁寧で押し付けがましくない日本語にする。
- 顧客名・店舗名は適切に差し込む。改行は本文に2つまで。絵文字は使わない。
- urgency は次の基準で判定する: 期限超過の項目があれば high、もうすぐ期限 (期限まで残りわずか) なら medium、それ以外は low。
- 価格や具体的な金額は提示しない (店舗が後で追記するため)。来店・点検のご提案にとどめる。`.trim();

export async function generateMaintenanceSuggestion(
  input: MaintenanceSuggestionInput,
): Promise<MaintenanceSuggestionResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = getAnthropicClient();
  const userMessage = buildUserMessage(input);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: AI_MODEL_FAST,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(SuggestionSchema) },
      }),
    );
    const parsed = msg.parsed_output;
    if (!parsed) return null;

    return {
      subject: clip(parsed.subject, 30),
      body: clipToSentence(parsed.body, 200),
      urgency: parsed.urgency,
    };
  } catch (err) {
    console.error("[maintenanceSuggestion] generation failed:", err);
    return null;
  }
}

/**
 * LLM 入力。signals を JSON で生に渡す代わりに、提案に効く事実だけを
 * 自然言語化して渡す (Haiku は数値の解釈にやや弱いため)。
 */
function buildUserMessage(input: MaintenanceSuggestionInput): string {
  const facts: string[] = [];

  facts.push(`顧客名: ${input.customerName}`);
  facts.push(`店舗名: ${input.shopName}`);

  const v = input.vehicleInfo;
  const vehicleLabel = [v.maker, v.model].filter(Boolean).join(" ");
  if (vehicleLabel) facts.push(`車両: ${vehicleLabel}`);
  if (typeof v.year === "number") {
    const age = new Date().getFullYear() - v.year;
    facts.push(`年式: ${v.year}年 (車齢 約${Math.max(0, age)}年)`);
  }
  if (typeof v.currentMileage === "number") {
    facts.push(`走行距離: ${v.currentMileage.toLocaleString("ja-JP")}km`);
  }

  if (input.dueReminders.length === 0) {
    facts.push("期限が近い/超過した整備項目: なし");
  } else {
    const lines = input.dueReminders.map((r) => {
      const parts: string[] = [r.service_name];
      if (r.overdue) {
        parts.push("【期限超過】");
      } else {
        parts.push("【もうすぐ期限】");
      }
      if (typeof r.days_until_due === "number") {
        parts.push(r.days_until_due < 0 ? `${Math.abs(r.days_until_due)}日超過` : `あと${r.days_until_due}日`);
      }
      if (typeof r.km_until_due === "number") {
        parts.push(
          r.km_until_due < 0
            ? `${Math.abs(r.km_until_due).toLocaleString("ja-JP")}km超過`
            : `あと${r.km_until_due.toLocaleString("ja-JP")}km`,
        );
      }
      return `  - ${parts.join(" ")}`;
    });
    facts.push(`期限が近い/超過した整備項目:\n${lines.join("\n")}`);
  }

  if (input.recentCertificates.length > 0) {
    const certLines = input.recentCertificates
      .slice(0, 5)
      .map((c) => {
        const date = (c.created_at ?? "").slice(0, 10);
        return `  - ${c.service_name ?? "施工"} (${date})`;
      })
      .join("\n");
    facts.push(`直近の施工履歴:\n${certLines}`);
  } else {
    facts.push("直近の施工履歴: なし");
  }

  return `次の事実に基づいて、顧客へ送る整備提案メッセージ (件名・本文・緊急度) を生成してください。\n\n${facts.map((f) => `- ${f}`).join("\n")}`;
}

/** 単純な文字数クリップ (件名用)。 */
function clip(text: string, maxLen: number): string {
  const t = text.trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen);
}

/**
 * モデルが maxLen 超を返してきたとき、句点で切って自然に終わらせる (本文用)。
 */
function clipToSentence(text: string, maxLen: number): string {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastDot = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("\n"));
  if (lastDot > maxLen * 0.5) return slice.slice(0, lastDot + 1);
  return slice;
}
