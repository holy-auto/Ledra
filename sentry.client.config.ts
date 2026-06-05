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

  // Unactionable browser/OS-level noise that surfaces as uncaught promise
  // rejections (mechanism: onunhandledrejection). None of these originate in
  // our code — they come from the device camera pipeline / embedded browsers.
  //
  // "setPhotoOptions failed" is a Chromium ImageCapture-subsystem error. Our
  // photo capture on /admin/certificates/new uses only <input type="file"
  // capture="environment"> (PhotoUploadSection) and never touches the
  // ImageCapture / getUserMedia Web APIs, so we cannot catch or fix it — it is
  // injected by the Android system camera / in-app webview. The remaining
  // entries are the sibling camera/getUserMedia failures from the same
  // pipeline; all are equally unactionable from app code. Drop them so they
  // don't trip high-priority alerts.
  ignoreErrors: [
    "setPhotoOptions failed",
    "Could not start video source",
    "The associated Track is in an invalid state",
    "The object can not be found here", // NotFoundError — camera/device gone mid-capture
    "Starting videoinput failed",
    "Could not start source", // generic getUserMedia source failure
    "The request is not allowed by the user agent", // NotAllowedError from embedded webviews
  ],

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
