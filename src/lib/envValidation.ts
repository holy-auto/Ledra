/**
 * Startup validation for critical environment variables.
 * Called during Next.js instrumentation to fail fast on misconfiguration.
 *
 * In production, missing critical secrets throw at boot to prevent serving
 * traffic in an insecure / silently-broken state. Format checks (e.g.
 * SECRET_ENCRYPTION_KEY must decode to 32 bytes) catch the long-tail of
 * "var was set but to garbage" deployment mistakes that silently disable
 * encryption at rest.
 */

type EnvVarCheck = {
  name: string;
  required: boolean;
  /** If true, warn instead of throwing */
  warnOnly?: boolean;
  /** Optional format validator. Return null if valid, or an error string. */
  validate?: (value: string) => string | null;
  /** Optional minimum length for the secret (entropy guard). */
  minLength?: number;
};

/** SECRET_ENCRYPTION_KEY must be base64-encoded 32 bytes (AES-256-GCM). */
function validateBase64Key32(value: string): string | null {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.length !== 32) {
      return `must decode to exactly 32 bytes (got ${decoded.length})`;
    }
    return null;
  } catch {
    return "must be valid base64";
  }
}

/** Generic high-entropy secret check: at least 32 chars. */
function validateHighEntropy(value: string): string | null {
  if (value.length < 32) {
    return `must be at least 32 characters (got ${value.length}). Use a cryptographically random value.`;
  }
  // Reject obvious placeholders / weak values
  const weak = /^(test|dev|change-?me|placeholder|example|secret|password|0+|1+|x+)$/i;
  if (weak.test(value)) {
    return "appears to be a placeholder / weak value";
  }
  return null;
}

const CRITICAL_ENV_VARS: EnvVarCheck[] = [
  // --- Supabase (required) ---
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true },
  { name: "SUPABASE_SERVICE_ROLE_KEY", required: true, minLength: 40 },

  // --- Server-to-server auth (required) ---
  { name: "CRON_SECRET", required: true, validate: validateHighEntropy },
  { name: "QSTASH_TOKEN", required: true },
  { name: "UPSTASH_REDIS_REST_URL", required: true },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: true },

  // --- Webhook signing (required when feature is wired) ---
  { name: "STRIPE_WEBHOOK_SECRET", required: true },

  // --- Customer auth pepper (required) ---
  { name: "CUSTOMER_AUTH_PEPPER", required: true, validate: validateHighEntropy },

  // --- Tenant secret encryption (REQUIRED in production) ---
  // AES-256-GCM key for encrypting tenant secrets (LINE channel secrets,
  // Square OAuth tokens, Google Calendar tokens, etc.). Without this,
  // encryptSecret() throws at the call site — meaning silent feature
  // breakage rather than a hard boot failure. Promote to required.
  {
    name: "SECRET_ENCRYPTION_KEY",
    required: true,
    validate: validateBase64Key32,
  },

  // --- Optional features ---
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
  { name: "PASSPORT_PUBLIC_ENABLED", required: false, warnOnly: true },
  { name: "POLYGON_ANCHOR_ENABLED", required: false, warnOnly: true },
  { name: "POLYGON_NETWORK", required: false, warnOnly: true },
  { name: "POLYGON_RPC_URL", required: false, warnOnly: true },
  { name: "POLYGON_PRIVATE_KEY", required: false, warnOnly: true },
  { name: "POLYGON_CONTRACT_ADDRESS", required: false, warnOnly: true },
  { name: "POLYGON_WALLET_WARN_BALANCE_POL", required: false, warnOnly: true },
  { name: "POLYGON_WALLET_ALERT_BALANCE_POL", required: false, warnOnly: true },
  // Phase 4: Provider-specific API keys
  { name: "HIVE_API_KEY", required: false, warnOnly: true },
  { name: "PINATA_JWT", required: false, warnOnly: true },
];

export function validateRequiredEnvVars(): void {
  const missing: string[] = [];
  const warnings: string[] = [];
  const formatErrors: string[] = [];

  for (const check of CRITICAL_ENV_VARS) {
    const value = process.env[check.name];
    if (!value) {
      if (check.warnOnly) {
        warnings.push(check.name);
      } else if (check.required) {
        missing.push(check.name);
      }
      continue;
    }

    if (check.minLength && value.length < check.minLength) {
      formatErrors.push(`${check.name}: must be at least ${check.minLength} characters`);
    }

    if (check.validate) {
      const err = check.validate(value);
      if (err) formatErrors.push(`${check.name}: ${err}`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`[env-validation] Optional env vars not set (some features disabled): ${warnings.join(", ")}`);
  }

  const hasCriticalProblem = missing.length > 0 || formatErrors.length > 0;
  if (hasCriticalProblem) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`Missing: ${missing.join(", ")}`);
    if (formatErrors.length > 0) parts.push(`Invalid format:\n  - ${formatErrors.join("\n  - ")}`);
    const msg = `[env-validation] CRITICAL: ${parts.join("; ")}`;
    console.error(msg);
    // In production, throw to prevent startup with missing/invalid critical config.
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
  }
}
