/**
 * Slack Incoming Webhook notifier for marketing leads.
 *
 * Thin wrapper around the generic `notifySlack` that binds to
 * `SLACK_LEADS_WEBHOOK_URL`.
 */

import { notifySlack as baseNotifySlack, type SlackPayload } from "@/lib/slack";

export async function notifySlack(payload: SlackPayload): Promise<void> {
  await baseNotifySlack(process.env.SLACK_LEADS_WEBHOOK_URL, payload);
}
