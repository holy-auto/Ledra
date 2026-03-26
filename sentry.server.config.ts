import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  beforeSend(event, hint) {
    // Strip PII
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }

    // Tag critical business errors for alerting
    const error = hint?.originalException;
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    const lowerMessage = message.toLowerCase();

    // Billing-related errors (Stripe, subscriptions)
    if (
      lowerMessage.includes("stripe") ||
      lowerMessage.includes("billing") ||
      lowerMessage.includes("subscription")
    ) {
      event.tags = { ...event.tags, business_domain: "billing" };
      event.level = "error";
    }

    // Auth-related errors
    if (
      lowerMessage.includes("unauthorized") ||
      lowerMessage.includes("forbidden") ||
      lowerMessage.includes("auth")
    ) {
      event.tags = { ...event.tags, business_domain: "auth" };
    }

    // Insurer access errors
    if (lowerMessage.includes("insurer")) {
      event.tags = { ...event.tags, business_domain: "insurer" };
    }

    return event;
  },
});
