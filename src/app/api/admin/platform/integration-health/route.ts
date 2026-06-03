/**
 * GET /api/admin/platform/integration-health
 *
 * Returns recent call metrics per integration service, read from Redis
 * sliding-window lists populated by withRetry.ts.
 *
 * Platform admin only.
 */
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiOk, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { getRedis } from "@/lib/upstash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TRACKED_SERVICES = [
  "stripe",
  "resend",
  "sendgrid",
  "polygon",
  "qstash",
  "square",
  "line",
  "healthchecks",
] as const;

type ServiceKey = (typeof TRACKED_SERVICES)[number];

interface MetricEntry {
  t: number;
  ok: number; // 1=success, 0=error
  ms: number; // latency in ms
}

interface ServiceHealth {
  key: ServiceKey;
  label: string;
  totalCalls: number;
  errorCalls: number;
  errorRatePct: number;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  status: "healthy" | "degraded" | "down" | "unknown";
}

const SERVICE_LABELS: Record<ServiceKey, string> = {
  stripe: "Stripe",
  resend: "Resend (メール)",
  sendgrid: "SendGrid (フォールバック)",
  polygon: "Polygon (ブロックチェーン)",
  qstash: "QStash (キュー)",
  square: "Square POS",
  line: "LINE",
  healthchecks: "Healthchecks.io",
};

function computeStatus(errorRatePct: number, totalCalls: number): ServiceHealth["status"] {
  if (totalCalls === 0) return "unknown";
  if (errorRatePct >= 50) return "down";
  if (errorRatePct >= 10) return "degraded";
  return "healthy";
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.floor(sorted.length * p)];
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) return apiUnauthorized();
  if (!isPlatformAdmin(caller)) return apiForbidden("運営管理者専用の機能です。");

  const redis = getRedis();
  const windowMs = 24 * 60 * 60 * 1000; // 24h window
  const since = Date.now() - windowMs;

  const services: ServiceHealth[] = [];

  for (const key of TRACKED_SERVICES) {
    const label = SERVICE_LABELS[key];

    if (!redis) {
      services.push({
        key,
        label,
        totalCalls: 0,
        errorCalls: 0,
        errorRatePct: 0,
        avgLatencyMs: null,
        p95LatencyMs: null,
        lastOkAt: null,
        lastErrorAt: null,
        status: "unknown",
      });
      continue;
    }

    let entries: MetricEntry[] = [];
    try {
      const raw = await redis.lrange(`ihealth:${key}`, 0, 199);
      entries = (raw as string[])
        .map((s) => {
          try {
            return JSON.parse(s) as MetricEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is MetricEntry => e !== null && e.t >= since);
    } catch {
      // Redis unavailable — return unknown status
    }

    if (entries.length === 0) {
      services.push({
        key,
        label,
        totalCalls: 0,
        errorCalls: 0,
        errorRatePct: 0,
        avgLatencyMs: null,
        p95LatencyMs: null,
        lastOkAt: null,
        lastErrorAt: null,
        status: "unknown",
      });
      continue;
    }

    const errorCalls = entries.filter((e) => e.ok === 0).length;
    const errorRatePct = Math.round((errorCalls / entries.length) * 100);

    const latencies = entries.map((e) => e.ms).filter((ms) => ms > 0).sort((a, b) => a - b);
    const avgLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null;
    const p95LatencyMs = percentile(latencies, 0.95);

    const okEntries = entries.filter((e) => e.ok === 1);
    const errEntries = entries.filter((e) => e.ok === 0);
    const lastOkAt = okEntries.length > 0 ? new Date(Math.max(...okEntries.map((e) => e.t))).toISOString() : null;
    const lastErrorAt =
      errEntries.length > 0 ? new Date(Math.max(...errEntries.map((e) => e.t))).toISOString() : null;

    services.push({
      key,
      label,
      totalCalls: entries.length,
      errorCalls,
      errorRatePct,
      avgLatencyMs,
      p95LatencyMs: p95LatencyMs !== null ? Math.round(p95LatencyMs) : null,
      lastOkAt,
      lastErrorAt,
      status: computeStatus(errorRatePct, entries.length),
    });
  }

  return apiOk({ services, windowHours: 24, redisAvailable: redis !== null });
}
