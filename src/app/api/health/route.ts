import { createServiceRoleAdmin } from "@/lib/supabase/admin";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Comprehensive health check for monitoring.
 * Returns 200 if all critical services are reachable, 503 otherwise.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};
  let allHealthy = true;

  // Check Supabase DB connectivity
  const dbStart = Date.now();
  try {
    const supabase = createServiceRoleAdmin("health check — probes DB connectivity, not tenant-scoped");
    const { error } = await supabase.from("tenants").select("id").limit(1);
    checks.database = {
      ok: !error,
      latency_ms: Date.now() - dbStart,
      ...(error ? { error: "DB query failed" } : {}),
    };
    if (error) allHealthy = false;
  } catch {
    checks.database = {
      ok: false,
      latency_ms: Date.now() - dbStart,
      error: "DB unreachable",
    };
    allHealthy = false;
  }

  // Check Stripe connectivity (config presence only — no API call)
  const stripeStart = Date.now();
  try {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      checks.stripe = { ok: false, error: "Required payment key not configured" };
      allHealthy = false;
    } else {
      checks.stripe = { ok: true, latency_ms: 0 };
    }
  } catch {
    checks.stripe = {
      ok: false,
      latency_ms: Date.now() - stripeStart,
      error: "Stripe check failed",
    };
    allHealthy = false;
  }

  // Check required env vars (names only — values are never exposed)
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
  ];

  const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
  checks.env_vars = {
    ok: missingEnvVars.length === 0,
    ...(missingEnvVars.length > 0 ? { error: `${missingEnvVars.length} required env var(s) missing` } : {}),
  };
  if (missingEnvVars.length > 0) allHealthy = false;

  return apiJson(
    {
      status: allHealthy ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allHealthy ? 200 : 503 },
  );
}
