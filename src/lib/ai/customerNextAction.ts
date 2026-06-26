/**
 * 顧客 360° ビュー の AI サマリ生成 (Phase 2)。
 *
 * deterministic な signals (= 数値・bool・配列) だけを LLM に渡し、1〜2 文の
 * 短いサマリを返してもらう。意思決定や CTA の選定はあくまで signals 側で
 * 確定済み — LLM の役割は「人間が読む文章への変換」だけ。
 *
 * 失敗時 (ANTHROPIC_API_KEY 未設定 / レスポンス壊れ / タイムアウト) は null を
 * 返してフェイルオープン。UI は signals だけで動くので機能的には影響なし。
 */
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import type { CustomerSignals } from "@/lib/customers/signals";

export interface SummaryInput {
  customerName: string;
  shopName?: string;
  signals: CustomerSignals;
}

const SYSTEM_PROMPT = `あなたは自動車施工店スタッフ向けのコンシェルジュです。
顧客の状態を要約した signals JSON を受け取り、店舗スタッフが「次に何をすべきか」を
3 秒で把握できる短いサマリを 1〜2 文で返してください。

ルール:
- signals に含まれない事実を作らない (ハルシネーション禁止)。
- 「〜のようです」「〜かもしれません」などの推測表現は使わない。事実だけ述べる。
- 句点 (。) で終える。改行や絵文字は入れない。
- 100 文字以内。
- 推奨アクションは signals.nextActions に含まれる範囲だけ。
`.trim();

export async function generateCustomerSummary(input: SummaryInput, opts?: { model?: string }): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client = getAnthropicClient();
  const userMessage = buildUserMessage(input);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.create({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    );
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!text) return null;
    return clipToSentence(text, 200);
  } catch (err) {
    console.error("[customerNextAction] summary generation failed:", err);
    return null;
  }
}

/**
 * LLM 入力。signals を冗長に並べる代わりに、サマリに効く事実だけを
 * 自然言語化して渡すと品質が安定する (Haiku は数値の解釈にやや弱いため)。
 */
function buildUserMessage(input: SummaryInput): string {
  const s = input.signals;
  const facts: string[] = [];

  facts.push(`顧客名: ${input.customerName}`);
  if (input.shopName) facts.push(`店舗: ${input.shopName}`);

  facts.push(`登録車両: ${s.vehicleCount} 台`);
  facts.push(`証明書: 有効 ${s.activeCertificateCount} / 累計 ${s.totalCertificateCount}`);

  if (s.daysSinceLastVisit == null) {
    facts.push("最終来店: なし");
  } else if (s.daysSinceLastVisit === 0) {
    facts.push("最終来店: 本日");
  } else {
    facts.push(`最終来店: ${s.daysSinceLastVisit} 日前`);
  }

  if (s.inProgressReservation) {
    facts.push(`進行中の案件: ${s.inProgressReservation.title ?? "(無題)"}`);
  }
  if (s.upcomingReservation) {
    facts.push(`次回予約: ${s.upcomingReservation.scheduled_date} ${s.upcomingReservation.title ?? ""}`);
  }
  if (s.completedReservationWithoutCertificate) {
    facts.push("完了案件あり / 有効な証明書なし");
  }
  if (s.overdueInvoiceCount > 0) {
    facts.push(`期限超過の請求: ${s.overdueInvoiceCount} 件 / ¥${s.overdueInvoiceTotal.toLocaleString("ja-JP")}`);
  } else if (s.unpaidInvoiceCount > 0) {
    facts.push(`未払請求: ${s.unpaidInvoiceCount} 件 / ¥${s.unpaidInvoiceTotal.toLocaleString("ja-JP")}`);
  }

  if (s.nextActions.length > 0) {
    const actions = s.nextActions.map((a) => `${a.label} (${a.priority})`).join(" / ");
    facts.push(`推奨アクション: ${actions}`);
  }

  return `次の signals に基づいて 1〜2 文のサマリを返してください。\n\n${facts.map((f) => `- ${f}`).join("\n")}`;
}

/**
 * モデルが 200 文字超を返してきたとき、句点で切って自然に終わらせる。
 */
function clipToSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastDot = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("."));
  if (lastDot > maxLen * 0.5) return slice.slice(0, lastDot + 1);
  return slice;
}
