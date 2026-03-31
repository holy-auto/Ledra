export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Security: validate critical env vars at startup
    const { assertPlatformTenantId } = await import("@/lib/auth/platformAdmin");
    assertPlatformTenantId();

    const { validateRequiredEnvVars } = await import("@/lib/envValidation");
    validateRequiredEnvVars();
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
