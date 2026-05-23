/**
 * Cron 連続失敗トラッカ + 閾値超過時のアラート通知 (G5 / G6 / G7 共通基盤)。
 *
 * 使い方:
 *
 *   try {
 *     // ...cron body
 *     await recordCronSuccess(supabase, "polygon-signer");
 *   } catch (e) {
 *     await recordCronFailure(supabase, "polygon-signer", e, {
 *       threshold: 3,                 // 3 連続失敗で通知
 *       alertCooldownMs: 6 * 60 * 60 * 1000, // 同一 streak で 6h に 1 回まで
 *     });
 *     throw e;
 *   }
 *
 * 設計:
 * - 成功時は consecutive_failures をゼロリセット
 * - 失敗時はインクリメント、threshold 超かつ cooldown 経過で Resend 通知
 * - 通知失敗時は streak テーブルは更新 (失敗を握りつぶさない)
 * - CONTACT_TO_EMAIL 未設定 / RESEND_API_KEY 未設定 → 通知 skip (cron 自体は止めない)
 */

import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sendEmail";
import { logger } from "@/lib/logger";

type SupabaseAdmin = ReturnType<typeof createServiceRoleAdmin>;

const DEFAULT_THRESHOLD = 3;
const DEFAULT_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 時間

export interface RecordFailureOptions {
  /** 閾値: ここまで連続失敗で初めて通知 (default 3) */
  threshold?: number;
  /** 同一 streak での再通知間隔 ms (default 6h) */
  alertCooldownMs?: number;
}

interface StreakRow {
  task: string;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_alert_at: string | null;
  last_error: string | null;
}

/**
 * Cron 成功時に呼ぶ。streak をゼロリセット。
 * 失敗トラッカが落ちても cron 本体を止めないため、エラーは握りつぶす。
 */
export async function recordCronSuccess(supabase: SupabaseAdmin, task: string): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase.from("cron_failure_streaks").upsert(
      {
        task,
        consecutive_failures: 0,
        last_success_at: now,
        updated_at: now,
        // last_failure_at / last_alert_at は保持 (履歴用)
      },
      { onConflict: "task" },
    );
  } catch (e) {
    logger.warn("[failureTracker] recordCronSuccess failed", {
      task,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Cron 失敗時に呼ぶ。streak をインクリメントし、threshold 超かつ cooldown 経過で
 * 運営にメール通知。
 */
export async function recordCronFailure(
  supabase: SupabaseAdmin,
  task: string,
  error: unknown,
  options: RecordFailureOptions = {},
): Promise<void> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const cooldownMs = options.alertCooldownMs ?? DEFAULT_ALERT_COOLDOWN_MS;
  const errorMessage = error instanceof Error ? error.message : String(error);
  const now = new Date();

  try {
    const { data: existing } = await supabase
      .from("cron_failure_streaks")
      .select("task, consecutive_failures, last_failure_at, last_alert_at, last_error")
      .eq("task", task)
      .maybeSingle<StreakRow>();

    const prevCount = existing?.consecutive_failures ?? 0;
    const newCount = prevCount + 1;

    await supabase.from("cron_failure_streaks").upsert(
      {
        task,
        consecutive_failures: newCount,
        last_failure_at: now.toISOString(),
        last_error: errorMessage.slice(0, 500),
        updated_at: now.toISOString(),
      },
      { onConflict: "task" },
    );

    if (newCount < threshold) {
      logger.info("[failureTracker] cron failed (below threshold)", { task, streak: newCount, threshold });
      return;
    }

    // threshold 超: cooldown check
    if (existing?.last_alert_at) {
      const lastAlertMs = new Date(existing.last_alert_at).getTime();
      if (now.getTime() - lastAlertMs < cooldownMs) {
        logger.info("[failureTracker] threshold exceeded but within alert cooldown", {
          task,
          streak: newCount,
          lastAlertAt: existing.last_alert_at,
        });
        return;
      }
    }

    // 通知送信
    await sendAlertEmail(task, newCount, errorMessage);

    await supabase
      .from("cron_failure_streaks")
      .update({ last_alert_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("task", task);

    logger.warn("[failureTracker] alert sent", { task, streak: newCount });
  } catch (e) {
    logger.warn("[failureTracker] recordCronFailure failed", {
      task,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function sendAlertEmail(task: string, streak: number, errorMessage: string): Promise<void> {
  const to = (process.env.CONTACT_TO_EMAIL ?? "").trim();
  if (!to) {
    logger.warn("[failureTracker] CONTACT_TO_EMAIL not set, skipping alert", { task });
    return;
  }

  const result = await sendEmail({
    to,
    subject: `[Ledra alert] cron "${task}" が ${streak} 回連続失敗`,
    text: [
      `Cron task: ${task}`,
      `Consecutive failures: ${streak}`,
      ``,
      `Latest error:`,
      errorMessage.slice(0, 2000),
      ``,
      `次のステップ:`,
      `- Vercel ログで該当 cron の最新実行を確認`,
      `- 一過性 5xx / 429 なら withRetry が自動回復するはず`,
      `- 連続 ${streak} 回失敗は構造的な問題の可能性 (token 失効、設定不備、依存先障害等)`,
      ``,
      `関連 runbook: docs/internal/operations-runbook.md`,
    ].join("\n"),
  });

  if (!result.ok) {
    logger.warn("[failureTracker] alert email failed to send", {
      task,
      provider: result.provider,
      error: result.error.slice(0, 200),
    });
  }
}
