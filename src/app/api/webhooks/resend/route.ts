import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError, apiError } from "@/lib/api/response";
import { maskEmail, scrubLog } from "@/lib/logger";
import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { claimWebhookEvent } from "@/lib/webhooks/idempotency";
import { captureSecurityEvent } from "@/lib/observability/sentry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resend Webhook handler — tracks email delivery events.
 *
 * Events: email.sent, email.delivered, email.delivery_delayed,
 *         email.complained, email.bounced, email.opened, email.clicked
 *
 * Setup: Add this URL in Resend Dashboard → Webhooks → Add Endpoint
 *        Set RESEND_WEBHOOK_SECRET env var with the signing secret.
 */

type ResendEvent = {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    [key: string]: unknown;
  };
};

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not configured");
    return apiInternalError(new Error("Webhook secret not configured"), "resend-webhook");
  }

  const rawBody = await req.text();

  // Verify webhook signature using Svix HMAC-SHA256
  {
    const signature = req.headers.get("svix-signature");
    const timestamp = req.headers.get("svix-timestamp");
    const id = req.headers.get("svix-id");

    if (!signature || !timestamp || !id) {
      return apiUnauthorized();
    }

    try {
      const wh = new Webhook(secret);
      wh.verify(rawBody, {
        "svix-id": id,
        "svix-timestamp": timestamp,
        "svix-signature": signature,
      });
    } catch (err) {
      console.error("[resend-webhook] Signature verification failed:", err);
      captureSecurityEvent("webhook_signature_failed", { provider: "resend", svix_id: id });
      return apiUnauthorized();
    }
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return apiValidationError("Invalid JSON");
  }

  if (!event.type || !event.data) {
    return apiValidationError("Invalid event format");
  }

  // Idempotency — Resend は失敗時に再送する。svix-id を event_id 代わりに使用。
  // (Resend payload 自体に一意 id がないため、svix-id を ingestion key とする)
  const svixId = req.headers.get("svix-id");
  if (svixId) {
    const supabase = createServiceRoleAdmin("resend-webhook idempotency claim");
    const claim = await claimWebhookEvent(supabase, "resend", svixId, event.type);
    if (claim === "duplicate") {
      console.info("[resend-webhook] duplicate event skipped", { svixId, type: event.type });
      return apiJson({ received: true, duplicate: true });
    }
    if (claim === "error") {
      // claim できない場合、Resend に 5xx を返して再送させる（重複処理よりは再送のほうが安全）
      console.error("[resend-webhook] idempotency claim failed", { svixId, type: event.type });
      captureSecurityEvent("webhook_idempotency_claim_failed", { provider: "resend", svix_id: svixId });
      return apiError({
        code: "internal_error",
        message: "Idempotency claim failed; please retry.",
        status: 503,
      });
    }
  }

  const { type, data } = event;
  // PII: 受信者メールはマスクし、件数 + 先頭1件のドメイン部のみで監視可能にする。
  const recipients = Array.isArray(data.to) ? data.to : [];
  const toMasked = recipients.map(maskEmail);
  const recipientCount = recipients.length;

  // Log all events for monitoring
  switch (type) {
    case "email.bounced":
      console.error("[resend-webhook] BOUNCE", {
        email_id: data.email_id,
        toMasked,
        recipientCount,
        subject: data.subject,
      });
      break;

    case "email.complained":
      console.error("[resend-webhook] COMPLAINT", {
        email_id: data.email_id,
        toMasked,
        recipientCount,
        subject: data.subject,
      });
      break;

    case "email.delivery_delayed":
      console.warn("[resend-webhook] DELAYED", {
        email_id: data.email_id,
        toMasked,
        recipientCount,
      });
      break;

    case "email.delivered":
    case "email.sent":
    case "email.opened":
    case "email.clicked":
      console.info(`[resend-webhook] ${scrubLog(type)}`, {
        email_id: data.email_id,
        toMasked,
        recipientCount,
      });
      break;

    default:
      console.info(`[resend-webhook] unknown event: ${scrubLog(type)}`);
  }

  return apiJson({ received: true });
}
