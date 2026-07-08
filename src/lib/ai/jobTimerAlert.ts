/**
 * 作業時間タイマーの乖離アラート文章化。
 *
 * `reservation_work_timer` (開始/完了時刻) と案件の想定時間を突き合わせ、
 * - 大きく超過: 「品質確認 / スタッフ追加 / 顧客連絡」を促す
 * - 大きく短縮: 「省略工程がないか確認」を促す
 * を 1 文 (60 字以内) で生成する。deterministic な判定はピュア関数で済ませ、
 * 文章化だけ Haiku に任せる。
 */
import { withRetry } from "@/lib/http/withRetry";
import { getAnthropicClient, AI_MODEL_FAST } from "@/lib/ai/client";
import { clipText } from "@/lib/ai/utils";

export type TimerSeverity = "ok" | "warn_over" | "alert_over" | "warn_short";

export interface TimerAlertInput {
  /** 実作業時間 (分)。in_progress なら開始からの経過、completed なら開始〜完了。 */
  actualMinutes: number;
  /** ワークフローテンプレ / メニュー集計から算出された想定 (分)。 */
  estimatedMinutes: number;
  /** 案件が completed か (= 確定値) / 進行中か (= まだ伸びる) */
  finalized: boolean;
}

export interface TimerAlertSuggestion {
  severity: TimerSeverity;
  /** UI バナーで使う 1 文。 */
  message: string;
  /** 乖離率: (actual - estimated) / estimated。負なら短縮。 */
  deviationRatio: number;
  ai: boolean;
}

/** 乖離率を返す。estimated が 0 / 負 のときは 0 を返してアラートを抑制。 */
export function evaluateTimerDeviation(input: TimerAlertInput): TimerSeverity {
  if (!Number.isFinite(input.actualMinutes) || !Number.isFinite(input.estimatedMinutes)) return "ok";
  if (input.estimatedMinutes <= 0) return "ok";
  const ratio = (input.actualMinutes - input.estimatedMinutes) / input.estimatedMinutes;
  if (ratio >= 0.5) return "alert_over"; // 50% 以上超過
  if (ratio >= 0.2) return "warn_over"; // 20% 以上超過
  // 短縮は finalized 時のみ意味がある (進行中は単に序盤)
  if (input.finalized && ratio <= -0.4) return "warn_short";
  return "ok";
}

const FALLBACK: Record<TimerSeverity, string> = {
  ok: "",
  warn_over: "想定時間を 2 割超過しています。スタッフを増員するか顧客に進捗連絡を。",
  alert_over: "想定時間を 5 割超過しています。品質と顧客説明を再確認してください。",
  warn_short: "想定より大幅に早く終わっています。工程抜け / 仕上げ漏れがないか確認を。",
};

const SYSTEM_PROMPT = `あなたは自動車施工店のオペレーション補佐です。
作業時間と想定時間の乖離を受け取り、現場スタッフが即座に動ける指示を 1 文 (60 字以内、句点で終わる) で返します。
推測表現禁止、改行 / 絵文字禁止、依頼ではなく「〜してください」の指示文で。`.trim();

export async function generateTimerAlert(
  input: TimerAlertInput,
  opts?: { model?: string },
): Promise<TimerAlertSuggestion> {
  const severity = evaluateTimerDeviation(input);
  const deviationRatio =
    input.estimatedMinutes > 0 ? (input.actualMinutes - input.estimatedMinutes) / input.estimatedMinutes : 0;
  const fallback = FALLBACK[severity];

  if (severity === "ok") return { severity, message: "", deviationRatio, ai: false };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { severity, message: fallback, deviationRatio, ai: false };
  }

  const client = getAnthropicClient();
  const facts = [
    `想定時間: ${input.estimatedMinutes} 分`,
    `実作業時間: ${input.actualMinutes} 分`,
    `乖離: ${Math.round(deviationRatio * 100)}%`,
    `案件状態: ${input.finalized ? "完了済" : "進行中"}`,
    `判定: ${severity}`,
  ];

  try {
    const msg = await withRetry("anthropic", () =>
      client.messages.create({
        model: opts?.model ?? AI_MODEL_FAST,
        max_tokens: 160,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: facts.map((f) => `- ${f}`).join("\n") }],
      }),
    );
    const text = msg.content[0]?.type === "text" ? msg.content[0].text.trim() : "";
    if (!text) return { severity, message: fallback, deviationRatio, ai: false };
    return { severity, message: clipText(text, 60), deviationRatio, ai: true };
  } catch (err) {
    console.error("[jobTimerAlert] generation failed:", err);
    return { severity, message: fallback, deviationRatio, ai: false };
  }
}
