import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

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

  const { type, data } = event;

  // Log all events for monitoring
  switch (type) {
    case "email.bounced":
      console.error("[resend-webhook] BOUNCE:", {
        email_id: data.email_id,
        to: data.to,
        subject: data.subject,
      });
      break;

    case "email.complained":
      console.error("[resend-webhook] COMPLAINT:", {
        email_id: data.email_id,
        to: data.to,
        subject: data.subject,
      });
      break;

    case "email.delivery_delayed":
      console.warn("[resend-webhook] DELAYED:", {
        email_id: data.email_id,
        to: data.to,
      });
      break;

    case "email.delivered":
    case "email.sent":
    case "email.opened":
    case "email.clicked":
      console.info(`[resend-webhook] ${type}:`, {
        email_id: data.email_id,
        to: data.to,
      });
      break;

    default:
      console.info(`[resend-webhook] unknown event: ${type}`);
  }

  return apiJson({ received: true });
}
