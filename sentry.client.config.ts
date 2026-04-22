import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Session Replay is attached lazily below — omitted here so its
  // MutationObserver + event listeners don't inflate mobile INP during
  // hydration and the first interactions.
  integrations: [],

  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.ip_address;
    }
    return event;
  },
});

// Defer Session Replay until the main thread is idle. In buffer mode
// (replaysSessionSampleRate=0, replaysOnErrorSampleRate=1) Replay only
// records when an error fires, so a few-second delay has minimal
// observability cost but large INP wins on mobile.
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const attachReplay = () => {
    import("@sentry/nextjs")
      .then((mod) => {
        const client = Sentry.getClient();
        if (client && typeof mod.replayIntegration === "function") {
          client.addIntegration(mod.replayIntegration());
        }
      })
      .catch(() => {
        /* swallow — replay is best-effort */
      });
  };

  type IdleWindow = Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(attachReplay, { timeout: 10_000 });
  } else {
    setTimeout(attachReplay, 5_000);
  }
}
