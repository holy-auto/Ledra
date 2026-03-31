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
import { getAnthropicClient, AI_MODEL_FAST, parseJsonResponse } from "@/lib/ai/client";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type FollowUpTriggerType =
  | "post_issue"        // 発行直後
  | "first_reminder"    // 30日後
  | "mid_followup"      // 90日後（既存）
  | "recoat_proposal"   // 180日後（既存）
  | "warranty_end"      // 保証終了前
  | "inspection_pre"    // 車検前
  | "seasonal_winter"   // 冬前コーティング提案
  | "seasonal_rainy";   // 梅雨前ガラス撥水提案

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
  emailBody: string;          // HTMLメール本文
  lineMessage: string;        // LINE用（100〜200文字 + 絵文字）
}

// ─────────────────────────────────────────────
// トリガー別テンプレート（フォールバック用）
// ─────────────────────────────────────────────

const TRIGGER_LABELS: Record<FollowUpTriggerType, string> = {
  post_issue:       "施工完了のお礼",
  first_reminder:   "1ヶ月点検のご案内",
  mid_followup:     "施工後3ヶ月のフォロー",
  recoat_proposal:  "次回施工のご提案",
  warranty_end:     "保証期間終了のご案内",
  inspection_pre:   "車検前のご案内",
  seasonal_winter:  "冬前コーティングのご提案",
  seasonal_rainy:   "梅雨前ガラス撥水のご提案",
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

export async function generateFollowUpContent(ctx: FollowUpContext): Promise<FollowUpContent> {
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

  const vehicleDesc = [ctx.vehicle.maker, ctx.vehicle.model, ctx.vehicle.color]
    .filter(Boolean)
    .join(" ");

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
    const msg = await client.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
    const result = parseJsonResponse<FollowUpContent>(text);

    return {
      emailSubject: result.emailSubject ?? `[${ctx.shop.name}] ${triggerLabel}`,
      emailBody: result.emailBody ?? buildFallbackContent(ctx).emailBody,
      lineMessage: result.lineMessage ?? buildFallbackContent(ctx).lineMessage,
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
  if (month === 10 || month === 11) return "seasonal_winter";  // 10〜11月: 冬前
  if (month === 5 || month === 6)  return "seasonal_rainy";    // 5〜6月: 梅雨前
  return null;
}

// ─────────────────────────────────────────────
// 車検前トリガー計算
// ─────────────────────────────────────────────

export function getDaysUntilInspection(
  nextInspectionDate: string | undefined | null
): number | null {
  if (!nextInspectionDate) return null;
  const today = new Date();
  const target = new Date(nextInspectionDate);
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

// ─────────────────────────────────────────────
// 保証終了前トリガー計算
// ─────────────────────────────────────────────

export function getDaysUntilWarrantyEnd(
  issuedAt: string,
  warrantyPeriod: string | undefined | null
): number | null {
  if (!warrantyPeriod) return null;

  const match = warrantyPeriod.match(/(\d+)\s*年/);
  if (!match) return null;

  const years = parseInt(match[1], 10);
  const issued = new Date(issuedAt);
  const expiryDate = new Date(issued);
  expiryDate.setFullYear(expiryDate.getFullYear() + years);

  const today = new Date();
  const diff = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
