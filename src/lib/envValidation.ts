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
  { name: "QSTASH_TOKEN", required: true },
  { name: "UPSTASH_REDIS_REST_URL", required: true },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: true },
  { name: "STRIPE_WEBHOOK_SECRET", required: true },
  { name: "CUSTOMER_AUTH_PEPPER", required: true },
  { name: "PLATFORM_TENANT_ID", required: false, warnOnly: true },
  { name: "STRIPE_SECRET_KEY", required: false, warnOnly: true },
  { name: "ANTHROPIC_API_KEY", required: false, warnOnly: true },
  { name: "GOOGLE_CLIENT_ID", required: false, warnOnly: true },
  { name: "GOOGLE_CLIENT_SECRET", required: false, warnOnly: true },
  { name: "RESEND_API_KEY", required: false, warnOnly: true },
  { name: "APP_URL", required: false, warnOnly: true },
  // Phase 3a: Verification provider env vars (all optional until activated)
  { name: "C2PA_MODE", required: false, warnOnly: true },
  { name: "C2PA_SIGNER_KEY", required: false, warnOnly: true },
  { name: "C2PA_SIGNER_CERT", required: false, warnOnly: true },
  { name: "DEEPFAKE_PROVIDER", required: false, warnOnly: true },
  { name: "DEEPFAKE_API_KEY", required: false, warnOnly: true },
  { name: "DEVICE_ATTESTATION_ENABLED", required: false, warnOnly: true },
  { name: "POLYGON_ANCHOR_ENABLED", required: false, warnOnly: true },
  { name: "POLYGON_NETWORK", required: false, warnOnly: true },
  { name: "POLYGON_RPC_URL", required: false, warnOnly: true },
  { name: "POLYGON_PRIVATE_KEY", required: false, warnOnly: true },
  { name: "POLYGON_CONTRACT_ADDRESS", required: false, warnOnly: true },
  // Phase 4: Provider-specific API keys
  { name: "HIVE_API_KEY", required: false, warnOnly: true },
  { name: "PINATA_JWT", required: false, warnOnly: true },
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
    console.warn(`[env-validation] Optional env vars not set (some features disabled): ${warnings.join(", ")}`);
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
