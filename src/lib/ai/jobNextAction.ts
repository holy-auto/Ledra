/**
 * 案件 (Job) ステータスに応じた次アクション提案。
 *
 * `customerNextAction.ts` は顧客 360° 用のサマリだが、こちらは Job ID を
 * 軸にした「現ステータスで何をすべきか」をスタッフ向けに 1〜3 行で返す。
 * Job は reservation を兼ねており、ステータス遷移は
 *   confirmed → arrived → in_progress → completed
 * の 4 段。ステータスごとに deterministic な候補を作っておき、
 * 文章化だけを Haiku に任せる (ハルシネーション抑制)。
 */
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";

export type JobStatus = "confirmed" | "arrived" | "in_progress" | "completed" | "cancelled";

export interface JobNextActionInput {
  status: JobStatus;
  hasCustomer: boolean;
  hasVehicle: boolean;
  hasActiveCertificate: boolean;
  hasUnpaidInvoice: boolean;
  hasOverdueInvoice: boolean;
  minutesSinceStatusChange: number | null;
  estimatedDurationMin: number | null;
}

export interface JobNextActionSuggestion {
  /** UI ボタン用キー。確定済の候補集合のみ返す。 */
  action:
    | "link_customer"
    | "link_vehicle"
    | "start_work"
    | "issue_certificate"
    | "create_invoice"
    | "collect_payment"
    | "send_thanks"
    | "follow_up_overdue"
    | "cancel_or_close";
  /** スタッフ向けの 1〜2 文 (60 字以内)。空文字なら UI 側でラベルだけ表示。 */
  message: string;
  /** 緊急度: high / med / low。 */
  priority: "high" | "med" | "low";
  /** AI で文章化されたか (false なら静的テンプレ)。 */
  ai: boolean;
}

const SYSTEM_PROMPT = `あなたは自動車施工店スタッフ向けのコンシェルジュです。
案件 (job) の現在の状況を受け取り、最優先で進めるべき次手を 1 文 (60 字以内、句点で終わる) で返してください。
事実に基づき、推測表現 ("〜と思われます" 等) は使わない。改行・絵文字禁止。`.trim();

/** ステータス + フラグから候補 action を deterministic に絞り込む。 */
export function pickJobNextActionCandidate(input: JobNextActionInput): JobNextActionSuggestion {
  const overdue = input.hasOverdueInvoice;
  const overrun =
    input.estimatedDurationMin != null &&
    input.minutesSinceStatusChange != null &&
    input.status === "in_progress" &&
    input.minutesSinceStatusChange > input.estimatedDurationMin * 1.2;

  if (overdue) {
    return {
      action: "follow_up_overdue",
      message: "期限超過の請求があります。督促連絡をしてください。",
      priority: "high",
      ai: false,
    };
  }

  switch (input.status) {
    case "confirmed":
      if (!input.hasCustomer) {
        return { action: "link_customer", message: "顧客が未紐付けです。先に顧客を選択してください。", priority: "high", ai: false };
      }
      if (!input.hasVehicle) {
        return { action: "link_vehicle", message: "車両が未紐付けです。来店までに車両を登録してください。", priority: "med", ai: false };
      }
      return { action: "start_work", message: "来店待ち。チェックイン時に作業開始へ進めてください。", priority: "low", ai: false };

    case "arrived":
      return { action: "start_work", message: "来店中です。作業開始ステータスに進めてください。", priority: "high", ai: false };

    case "in_progress":
      if (overrun) {
        return {
          action: "issue_certificate",
          message: "想定時間を超過しています。進捗を確認してください。",
          priority: "high",
          ai: false,
        };
      }
      return { action: "issue_certificate", message: "作業中。完了したら証明書を発行してください。", priority: "med", ai: false };

    case "completed":
      if (!input.hasActiveCertificate) {
        return { action: "issue_certificate", message: "完了済みですが有効な証明書がありません。", priority: "high", ai: false };
      }
      if (input.hasUnpaidInvoice) {
        return { action: "collect_payment", message: "未払いの請求があります。入金確認してください。", priority: "med", ai: false };
      }
      if (!input.hasUnpaidInvoice && !input.hasOverdueInvoice) {
        return { action: "send_thanks", message: "全工程完了。サンクスメッセージ送付の検討時期です。", priority: "low", ai: false };
      }
      return { action: "create_invoice", message: "請求書がまだ作成されていません。", priority: "med", ai: false };

    case "cancelled":
      return { action: "cancel_or_close", message: "キャンセル済み。資料を整理してアーカイブしてください。", priority: "low", ai: false };
  }
}

/**
 * AI で 1 文を文章化する。失敗時は deterministic な message をそのまま返す。
 */
export async function generateJobNextAction(input: JobNextActionInput): Promise<JobNextActionSuggestion> {
  const base = pickJobNextActionCandidate(input);
  if (!process.env.ANTHROPIC_API_KEY) return base;
  const client = getAnthropicClient();

  const facts = [
    `ステータス: ${input.status}`,
    `顧客紐付け: ${input.hasCustomer ? "あり" : "なし"}`,
    `車両紐付け: ${input.hasVehicle ? "あり" : "なし"}`,
    `有効な証明書: ${input.hasActiveCertificate ? "あり" : "なし"}`,
    `未払請求: ${input.hasUnpaidInvoice ? "あり" : "なし"}`,
    `期限超過請求: ${input.hasOverdueInvoice ? "あり" : "なし"}`,
    `想定 action: ${base.action}`,
  ];
  if (input.estimatedDurationMin != null) facts.push(`想定作業分: ${input.estimatedDurationMin}`);
  if (input.minutesSinceStatusChange != null) facts.push(`ステータス変更後の経過分: ${input.minutesSinceStatusChange}`);

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.create({
        model: AI_MODEL_FAST,
        max_tokens: 192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.map((f) => `- ${f}`).join("\n") }],
      }),
    );
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!text) return base;
    return { ...base, message: clip(text, 60), ai: true };
  } catch (err) {
    console.error("[jobNextAction] generation failed:", err);
    return base;
  }
}

function clip(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  if (t.length <= maxLen) return t;
  const slice = t.slice(0, maxLen);
  const lastDot = Math.max(slice.lastIndexOf("。"), slice.lastIndexOf("."));
  if (lastDot > maxLen * 0.5) return slice.slice(0, lastDot + 1);
  return slice;
}
