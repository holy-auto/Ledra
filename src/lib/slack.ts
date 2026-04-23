/**
 * Generic Slack Incoming Webhook notifier.
 *
 * No-ops silently if `webhookUrl` is empty/undefined, so local dev and
 * preview deployments don't fail when a secret is absent.
 */

export type SlackField = { title: string; value: string; short?: boolean };

export type SlackPayload = {
  text: string;
  fields?: SlackField[];
  color?: string;
};

export async function notifySlack(
  webhookUrl: string | undefined,
  payload: SlackPayload,
): Promise<void> {
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

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: payload.text,
        attachments,
      }),
    });
    if (!res.ok) {
      console.error("[slack] webhook responded non-OK:", res.status);
    }
  } catch (err) {
    console.error("[slack] webhook error:", err);
  }
}
