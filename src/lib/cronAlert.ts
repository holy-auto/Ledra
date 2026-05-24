/**
 * Cron job failure alert.
 *
 * 二重通知 (Sentry + email) で見逃しを防ぐ:
 *   1. Sentry に `cron_job` タグ付きで送信 (検知・集計・グラフ化)
 *   2. CONTACT_TO_EMAIL に通知 (即応性 / メーリス共有)
 *
 * メール送信は src/lib/email/sendEmail.ts (Resend → SendGrid フォールバック)
 * 経由なので、Resend 全断時も SendGrid に自動切替される。
 */

import { sendEmail } from "@/lib/email/sendEmail";

/** Lazily forward to Sentry without blocking cron completion. */
function captureSentry(jobName: string, error: unknown) {
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag("cron_job", jobName);
        scope.setLevel("error");
        Sentry.captureException(error);
      });
    })
    .catch(() => {});
}

export async function sendCronFailureAlert(jobName: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[cron/${jobName}] FAILURE:`, message);
  captureSentry(jobName, error);

  const alertEmail = process.env.CONTACT_TO_EMAIL;
  if (!alertEmail) return;

  await sendEmail({
    to: alertEmail,
    subject: `[Ledra Cron Alert] ${jobName} failed`,
    text: [
      `Cron job "${jobName}" failed at ${new Date().toISOString()}`,
      "",
      `Error: ${message}`,
      ...(stack ? ["", "Stack:", stack] : []),
    ].join("\n"),
  });
}
