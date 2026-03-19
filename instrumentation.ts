export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const onRequestError = (...args: any[]) => {
  import("@sentry/nextjs").then((Sentry) => {
    if ("captureRequestError" in Sentry && typeof Sentry.captureRequestError === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Sentry.captureRequestError as (...a: any[]) => void)(...args);
    }
  });
};
