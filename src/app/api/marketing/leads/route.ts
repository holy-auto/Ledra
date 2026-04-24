/**
 * POST /api/marketing/leads
 *
 * Unified lead capture endpoint for the public marketing site.
 * - Zod-validated payload
 * - Rate-limited per IP (Upstash Redis if configured)
 * - Persists to `marketing_leads`
 * - Notifies Slack (`SLACK_LEADS_WEBHOOK_URL`)
 * - Sends brand-voice auto-reply via Resend
 *
 * No auth required — this is the public marketing site's single write API.
 */

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { marketingLeadSchema, parseBody } from "@/lib/validation/schemas";
import { apiJson, apiValidationError, apiInternalError } from "@/lib/api/response";
import { saveLead, notifyLeadToSlack } from "@/lib/marketing/leads";
import { sendLeadAutoReply } from "@/lib/marketing/leadReply";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`marketing-leads:${ip}`, { limit: 5, windowSec: 900 });
  if (!rl.allowed) {
    return apiJson(
      {
        error: "rate_limited",
        message: "送信が多すぎます。しばらくしてから再度お試しください。",
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return apiValidationError("Invalid JSON");
  }

  const parsed = parseBody(marketingLeadSchema, rawBody);
  if (!parsed.success) {
    return apiValidationError("入力内容をご確認ください", { details: parsed.errors });
  }

  const { consent, ...rest } = parsed.data;
  const consent_at = consent ? new Date().toISOString() : undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  const persist = await saveLead({
    ...rest,
    consent_at,
    user_agent: userAgent,
  });

  if ("error" in persist) {
    return apiInternalError(new Error(persist.error), "marketing lead save");
  }

  // Fire-and-forget notifications: don't fail the user request if side effects error.
  try {
    await notifyLeadToSlack({ ...rest, consent_at, user_agent: userAgent });
  } catch (err) {
    console.error("[leads] slack notify failed:", err);
  }

  try {
    await sendLeadAutoReply({
      to: rest.email,
      source: rest.source,
      name: rest.name,
    });
  } catch (err) {
    console.error("[leads] auto-reply failed:", err);
  }

  return apiJson({ ok: true, id: persist.id });
}
