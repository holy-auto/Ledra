/**
 * Startup validation for critical environment variables.
 * Called during Next.js instrumentation to fail fast on misconfiguration.
 */

type EnvVarCheck = {
  name: string;
  required: boolean;
  /** If true, warn instead of throwing */
  warnOnly?: boolean;
};

const CRITICAL_ENV_VARS: EnvVarCheck[] = [
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true },
  { name: "CRON_SECRET", required: true },
  { name: "PLATFORM_TENANT_ID", required: false, warnOnly: true },
  { name: "STRIPE_SECRET_KEY", required: false, warnOnly: true },
  { name: "STRIPE_WEBHOOK_SECRET", required: false, warnOnly: true },
  { name: "RESEND_API_KEY", required: false, warnOnly: true },
];

export function validateRequiredEnvVars(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const check of CRITICAL_ENV_VARS) {
    const value = process.env[check.name];
    if (!value) {
      if (check.warnOnly) {
        warnings.push(check.name);
      } else if (check.required) {
        missing.push(check.name);
      }
    }
  }

  if (warnings.length > 0) {
    console.warn(
      `[env-validation] Optional env vars not set (some features disabled): ${warnings.join(", ")}`,
    );
  }

  if (missing.length > 0) {
    const msg = `[env-validation] CRITICAL: Missing required env vars: ${missing.join(", ")}`;
    console.error(msg);
    // In production, throw to prevent startup with missing critical config
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
  }
}
