import * as Sentry from "@sentry/nextjs";
import { scrubSentryRequestHeaders } from "@/lib/observability/scrubSentryRequest";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,

  // C-L5 是正 (2026-09-08): edge config には beforeSend 自体が無く、
  // authorization/cookie ヘッダがそのまま Sentry に送られ得た。
  beforeSend(event) {
    scrubSentryRequestHeaders(event);
    return event;
  },
});
