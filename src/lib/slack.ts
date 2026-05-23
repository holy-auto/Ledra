/**
 * Generic Slack Incoming Webhook notifier.
 *
 * No-ops silently if `webhookUrl` is empty/undefined, so local dev and
 * preview deployments don't fail when a secret is absent.
 *
 * すべての Slack 通知 (lead / signup / inquiry / agent / customer) が
 * 共通の withRetry("slack", ...) を経由する。lead 通知の欠落は売上機会
 * 損失に直結するため、5xx/429 で自動 retry させる。
 */

import { withRetry } from "@/lib/http/withRetry";

export type SlackField = { title: string; value: string; short?: boolean };

export type SlackPayload = {
  text: string;
  fields?: SlackField[];
  color?: string;
};

export async function notifySlack(webhookUrl: string | undefined, payload: SlackPayload): Promise<void> {
  if (!webhookUrl) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[slack] webhook not configured, skipping:", payload.text);
    }
    return;
  }

  const attachments =
    payload.fields && payload.fields.length > 0
      ? [
          {
            color: payload.color ?? "#60a5fa",
            fields: payload.fields,
          },
        ]
      : undefined;

  const body = JSON.stringify({ text: payload.text, attachments });

  try {
    const res = await withRetry("slack", async () => {
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (r.status >= 500 || r.status === 429) {
        const err = new Error(`slack:${r.status}`) as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r;
    });
    if (!res.ok) {
      console.error("[slack] webhook responded non-OK:", res.status);
    }
  } catch (err) {
    console.error("[slack] webhook error:", err);
  }
}
