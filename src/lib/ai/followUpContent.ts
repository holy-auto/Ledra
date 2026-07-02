/**
 * B-4: 発行後フォローAI（拡張版）
 *
 * 既存の90日・180日フォローに加え、以下のトリガーを追加:
 * - 発行直後（0日）: お礼 + 証明書URL
 * - 30日後: 定期点検リマインド
 * - 車検前60日: 車検証の期日から逆算
 * - 保証終了前60日: warranty_period から計算
 * - 季節提案: 10月（冬前コーティング）、5月（梅雨前ガラス）
 *
 * LINE / メール 両対応。Standard/Pro プランで AI パーソナライズ。
 */
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

const FollowUpContentSchema = z.object({
  emailSubject: z.string(),
  emailBody: z.string(),
  lineMessage: z.string(),
});

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type FollowUpTriggerType =
  | "post_issue" // 発行直後
  | "first_reminder" // 30日後
  | "mid_followup" // 90日後（既存）
  | "recoat_proposal" // 180日後（既存）
  | "warranty_end" // 保証終了前
  | "inspection_pre" // 車検前
  | "maintenance_reminder" // メンテナンスリマインダー（6/12 ヶ月点検）
  | "seasonal_winter" // 冬前コーティング提案
  | "seasonal_rainy"; // 梅雨前ガラス撥水提案

export interface FollowUpContext {
  trigger: FollowUpTriggerType;
  customer: { name: string };
  certificate: {
    label: string;
    issued_at: string;
    warranty_period?: string;
    expiry_date?: string;
  };
  vehicle: { maker?: string; model?: string; color?: string };
  shop: { name: string; phone?: string };
  daysElapsed?: number;
  daysUntilEvent?: number;
}

export interface FollowUpContent {
  emailSubject: string;
  emailBody: string; // HTMLメール本文
  lineMessage: string; // LINE用（100〜200文字 + 絵文字）
}

// ─────────────────────────────────────────────
// トリガー別テンプレート（フォールバック用）
// ─────────────────────────────────────────────

const TRIGGER_LABELS: Record<FollowUpTriggerType, string> = {
  post_issue: "施工完了のお礼",
  first_reminder: "1ヶ月点検のご案内",
  mid_followup: "施工後3ヶ月のフォロー",
  recoat_proposal: "次回施工のご提案",
  warranty_end: "保証期間終了のご案内",
  inspection_pre: "車検前のご案内",
  maintenance_reminder: "定期メンテナンスのご案内",
  seasonal_winter: "冬前コーティングのご提案",
  seasonal_rainy: "梅雨前ガラス撥水のご提案",
};

function buildFallbackContent(ctx: FollowUpContext): FollowUpContent {
  const shop = ctx.shop.name;
  const customer = ctx.customer.name;
  const cert = ctx.certificate.label;
  const triggerLabel = TRIGGER_LABELS[ctx.trigger];

  const emailBody = `
<p>${customer} 様</p>
<p>${shop} です。</p>
<p>「${cert}」に関して${triggerLabel}のご連絡を差し上げます。</p>
<p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
<p style="font-size:12px;color:#888;">${shop}${ctx.shop.phone ? ` / TEL: ${ctx.shop.phone}` : ""}</p>
`;

  return {
    emailSubject: `[${shop}] ${triggerLabel}`,
    emailBody,
    lineMessage: `【${shop}】${customer}様、${triggerLabel}のご連絡です。詳しくはメールをご確認ください。`,
  };
}

// ─────────────────────────────────────────────
// AI パーソナライズ生成
// ─────────────────────────────────────────────

export async function generateFollowUpContent(
  ctx: FollowUpContext,
  opts?: { model?: string },
): Promise<FollowUpContent> {
  const client = getAnthropicClient();
  const triggerLabel = TRIGGER_LABELS[ctx.trigger];

  const systemPrompt = `あなたは自動車施工店のコミュニケーションAIです。
顧客向けのフォローアップメッセージを生成してください。

以下のJSON形式のみで回答してください:
{
  "emailSubject": "メール件名（30文字以内）",
  "emailBody": "メール本文HTML（<p>タグ使用可、200文字以内の簡潔な文）",
  "lineMessage": "LINEメッセージ（絵文字を含む、100〜180文字）"
}`;

  const vehicleDesc = [ctx.vehicle.maker, ctx.vehicle.model, ctx.vehicle.color].filter(Boolean).join(" ");

  const contextDesc = [
    ctx.daysElapsed != null ? `施工から${ctx.daysElapsed}日経過` : null,
    ctx.daysUntilEvent != null ? `イベントまで${ctx.daysUntilEvent}日` : null,
    ctx.certificate.warranty_period ? `保証期間: ${ctx.certificate.warranty_period}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const userMessage = `以下の状況で「${triggerLabel}」メッセージを生成してください。

顧客名: ${ctx.customer.name}
施工店: ${ctx.shop.name}
施工内容: ${ctx.certificate.label}
車両: ${vehicleDesc || "不明"}
${contextDesc ? `補足: ${contextDesc}` : ""}

トーン: 親しみやすく、押しつけがましくなく、次のアクションを自然に促す`;

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.parse({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        output_config: { format: zodOutputFormat(FollowUpContentSchema) },
      }),
    );

    const result = msg.parsed_output;
    if (!result) return buildFallbackContent(ctx);
    const fallback = buildFallbackContent(ctx);
    return {
      emailSubject: result.emailSubject || `[${ctx.shop.name}] ${triggerLabel}`,
      emailBody: result.emailBody || fallback.emailBody,
      lineMessage: result.lineMessage || fallback.lineMessage,
    };
  } catch (err) {
    console.error("[followUpContent] AI error, using fallback:", err);
    return buildFallbackContent(ctx);
  }
}

// ─────────────────────────────────────────────
// 季節トリガー判定ユーティリティ
// ─────────────────────────────────────────────

export function getSeasonalTrigger(month: number): FollowUpTriggerType | null {
  if (month === 10 || month === 11) return "seasonal_winter"; // 10〜11月: 冬前
  if (month === 5 || month === 6) return "seasonal_rainy"; // 5〜6月: 梅雨前
  return null;
}

// ─────────────────────────────────────────────
// 車検前トリガー計算
// ─────────────────────────────────────────────

export function getDaysUntilInspection(nextInspectionDate: string | undefined | null): number | null {
  if (!nextInspectionDate) return null;
  const today = new Date();
  const target = new Date(nextInspectionDate);
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─────────────────────────────────────────────
// 保証終了前トリガー計算
// ─────────────────────────────────────────────

/** JST (UTC+9) の暦日 (年/月/日) を取り出す。保証・施工日は店舗ローカル(日本)の暦日で扱う。 */
function toJstYmd(value: string | Date): { y: number; m: number; d: number } | null {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return { y: jst.getUTCFullYear(), m: jst.getUTCMonth(), d: jst.getUTCDate() };
}

/**
 * 保証期間テキストを月数に変換する。
 * 「3年」「12ヶ月」「6カ月」「1年6ヶ月」「36months」「2 years」等に対応。
 * 年と月が併記されている場合、月成分は剰余 (例「1年6ヶ月」の 6) のみ加算する。
 * 「3年（36ヶ月）」のような同一期間の重複表記を二重計上しないよう、月 >= 12 は無視する。
 * 解釈できなければ null。
 */
export function parseWarrantyPeriodMonths(warrantyPeriod: string | undefined | null): number | null {
  if (!warrantyPeriod) return null;

  const yearMatch = warrantyPeriod.match(/(\d+)\s*(?:年|years?|yrs?)/i);
  const monthMatch = warrantyPeriod.match(/(\d+)\s*(?:ヶ月|カ月|ケ月|か月|months?|mos?)/i);
  if (!yearMatch && !monthMatch) return null;

  const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  const rawMonths = monthMatch ? parseInt(monthMatch[1], 10) : 0;
  // 年が併記されているときの月は剰余分のみ採用 (12 以上は重複表記とみなして無視)。
  const months = yearMatch && monthMatch ? (rawMonths < 12 ? rawMonths : 0) : rawMonths;
  return years * 12 + months;
}

/**
 * 施工日 (issuedAt) と保証期間テキストから保証終了日 (JST 暦日, YYYY-MM-DD) を算出する。
 * 月末オーバーフロー (例: 1/31 + 1ヶ月 → 3/3) は月末 (2/28) に丸める。
 * 解釈できない期間 / 不正な日付なら null。
 */
export function computeWarrantyEndDate(issuedAt: string, warrantyPeriod: string | undefined | null): string | null {
  const months = parseWarrantyPeriodMonths(warrantyPeriod);
  if (months == null) return null;
  const ymd = toJstYmd(issuedAt);
  if (!ymd) return null;

  const end = new Date(Date.UTC(ymd.y, ymd.m, ymd.d));
  end.setUTCMonth(end.getUTCMonth() + months);
  if (end.getUTCDate() !== ymd.d) end.setUTCDate(0); // 翌月送りになったら月末に丸める
  return end.toISOString().slice(0, 10);
}

/**
 * 保証終了日 (YYYY-MM-DD) と本日 (JST 暦日) の差を「日数」で返す。
 * 双方を JST 暦日の 0 時に正準化するため、cron の実行時刻 (10:00 UTC 等) に依存しない。
 */
export function daysUntilJstDate(dateStr: string | null | undefined): number | null {
  const ymd = dateStr?.slice(0, 10);
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const target = new Date(`${ymd}T00:00:00Z`).getTime();
  const today = toJstYmd(new Date());
  if (!today) return null;
  return Math.round((target - Date.UTC(today.y, today.m, today.d)) / (1000 * 60 * 60 * 24));
}

export function getDaysUntilWarrantyEnd(issuedAt: string, warrantyPeriod: string | undefined | null): number | null {
  const end = computeWarrantyEndDate(issuedAt, warrantyPeriod);
  return end ? daysUntilJstDate(end) : null;
}
