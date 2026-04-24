import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/security-audit
 * Security audit data for platform operations — platform admin only.
 *
 * Returns: insurer access logs, auth events, suspicious patterns
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) {
      return apiUnauthorized();
    }
    if (!isPlatformAdmin(caller)) {
      return apiForbidden();
    }

    const admin = getSupabaseAdmin();
    const now = new Date();
    const url = new URL(req.url);
    const days = Math.min(30, Math.max(1, parseInt(url.searchParams.get("days") ?? "7", 10)));
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

    type InsurerAccessLog = {
      id: string;
      insurer_id: string | null;
      action: string | null;
      ip_address: string | null;
      user_agent: string | null;
      certificate_id: string | null;
      created_at: string | null;
    };
    type StripeEventRow = { id: number; event_type: string | null; created_at: string | null };
    type PiiLogRow = {
      id: string;
      tenant_id: string | null;
      user_id: string | null;
      action: string | null;
      target_type: string | null;
      created_at: string | null;
    };

    const [accessResult, webhookResult, piiResult] = await Promise.allSettled([
      // Insurer access logs
      admin
        .from("insurer_access_logs")
        .select("id, insurer_id, action, ip_address, user_agent, certificate_id, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<InsurerAccessLog[]>(),
      // Stripe webhook events
      admin
        .from("stripe_processed_events")
        .select("id, event_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<StripeEventRow[]>(),
      // PII disclosure logs
      admin
        .from("pii_disclosure_logs")
        .select("id, tenant_id, user_id, action, target_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<PiiLogRow[]>(),
    ]);

    const accessLogs: InsurerAccessLog[] = accessResult.status === "fulfilled" ? (accessResult.value.data ?? []) : [];
    const webhookEvents: StripeEventRow[] =
      webhookResult.status === "fulfilled" ? (webhookResult.value.data ?? []) : [];
    const piiLogs: PiiLogRow[] = piiResult.status === "fulfilled" ? (piiResult.value.data ?? []) : [];

    // Analyze access patterns
    const ipCounts: Record<string, number> = {};
    const insurerCounts: Record<string, number> = {};
    for (const log of accessLogs) {
      const ip = log.ip_address ?? "unknown";
      const iid = log.insurer_id ?? "unknown";
      ipCounts[ip] = (ipCounts[ip] ?? 0) + 1;
      insurerCounts[iid] = (insurerCounts[iid] ?? 0) + 1;
    }

    const suspiciousIps = Object.entries(ipCounts)
      .filter(([, count]) => count > 200)
      .map(([ip, count]) => ({ ip, count }))
      .sort((a, b) => b.count - a.count);

    const topAccessors = Object.entries(insurerCounts)
      .map(([insurerId, count]) => ({ insurerId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Webhook event type distribution
    const webhookTypes: Record<string, number> = {};
    for (const evt of webhookEvents) {
      const t = evt.event_type ?? "unknown";
      webhookTypes[t] = (webhookTypes[t] ?? 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      period: { days, since },
      access: {
        totalLogs: accessLogs.length,
        suspiciousIps,
        topAccessors,
        recentLogs: accessLogs.slice(0, 50),
      },
      webhooks: {
        total: webhookEvents.length,
        typeDistribution: webhookTypes,
      },
      piiDisclosure: {
        total: piiLogs.length,
        recentLogs: piiLogs.slice(0, 50),
      },
    });
  } catch (e: unknown) {
    return apiInternalError(e, "platform/security-audit GET");
  }
}
