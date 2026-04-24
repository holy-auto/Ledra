import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/operations
 * Platform operations dashboard data — platform admin (運営) only.
 *
 * Returns: system health, tenant overview, error stats, recent activity
 */
type TenantOverviewRow = {
  id: string;
  name: string | null;
  plan_tier: string | null;
  is_active: boolean | null;
  created_at: string | null;
  stripe_subscription_id: string | null;
};

type HeavyAccessLog = { insurer_id: string };

export async function GET() {
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
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries for all dashboard data
    const [
      tenantsResult,
      certsResult,
      certs24hResult,
      usersResult,
      insurersResult,
      webhookResult,
      billingIssuesResult,
      heavyAccessResult,
      agentsResult,
      recentCertsResult,
    ] = await Promise.allSettled([
      // 1. Tenant overview
      admin
        .from("tenants")
        .select("id, name, plan_tier, is_active, created_at, stripe_subscription_id")
        .returns<TenantOverviewRow[]>(),
      // 2. Total certificates
      admin.from("certificates").select("id", { count: "exact", head: true }),
      // 3. Certificates last 24h
      admin.from("certificates").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      // 4. Total auth users
      admin.from("tenant_memberships").select("user_id", { count: "exact", head: true }),
      // 5. Insurers count
      admin.from("insurer_users").select("id", { count: "exact", head: true }),
      // 6. Webhooks 24h
      admin.from("stripe_processed_events").select("id", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      // 7. Billing issues: subscription exists but is_active=false
      admin
        .from("tenants")
        .select("id, name, plan_tier, stripe_subscription_id")
        .not("stripe_subscription_id", "is", null)
        .eq("is_active", false),
      // 8. Heavy insurer access 24h
      admin.from("insurer_access_logs").select("insurer_id").gte("created_at", oneDayAgo).returns<HeavyAccessLog[]>(),
      // 9. Agent applications pending
      admin.from("agent_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
      // 10. Recent certificates (for activity feed)
      admin
        .from("certificates")
        .select("public_id, customer_name, status, tenant_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    // Process tenants
    const tenants: TenantOverviewRow[] = tenantsResult.status === "fulfilled" ? (tenantsResult.value.data ?? []) : [];
    const activeTenants = tenants.filter((t) => t.is_active);
    const inactiveTenants = tenants.filter((t) => !t.is_active);
    const recentTenants = tenants.filter((t) => t.created_at && t.created_at >= sevenDaysAgo);

    // Plan distribution
    const planDistribution: Record<string, number> = {};
    for (const t of tenants) {
      const plan = t.plan_tier ?? "free";
      planDistribution[plan] = (planDistribution[plan] ?? 0) + 1;
    }

    // Total certs
    const totalCerts = certsResult.status === "fulfilled" ? (certsResult.value.count ?? 0) : 0;
    const certs24h = certs24hResult.status === "fulfilled" ? (certs24hResult.value.count ?? 0) : 0;

    // Users
    const totalUsers = usersResult.status === "fulfilled" ? (usersResult.value.count ?? 0) : 0;
    const totalInsurers = insurersResult.status === "fulfilled" ? (insurersResult.value.count ?? 0) : 0;

    // Webhooks
    const webhooks24h = webhookResult.status === "fulfilled" ? (webhookResult.value.count ?? 0) : 0;

    // Billing issues
    const billingIssues = billingIssuesResult.status === "fulfilled" ? (billingIssuesResult.value.data ?? []) : [];

    // Heavy access
    const accessLogs: HeavyAccessLog[] =
      heavyAccessResult.status === "fulfilled" ? (heavyAccessResult.value.data ?? []) : [];
    const accessCounts: Record<string, number> = {};
    for (const log of accessLogs) {
      const id = log.insurer_id;
      accessCounts[id] = (accessCounts[id] ?? 0) + 1;
    }
    const heavyAccessors = Object.entries(accessCounts)
      .filter(([, count]) => count > 100)
      .map(([id, count]) => ({ insurerId: id, count }))
      .sort((a, b) => b.count - a.count);

    // Pending agents
    const pendingAgents = agentsResult.status === "fulfilled" ? (agentsResult.value.count ?? 0) : 0;

    // Recent certs
    const recentCerts = recentCertsResult.status === "fulfilled" ? (recentCertsResult.value.data ?? []) : [];

    // Build alerts
    const alerts: { level: "error" | "warning" | "info"; message: string; detail?: string }[] = [];

    if (billingIssues.length > 0) {
      alerts.push({
        level: "error",
        message: `${billingIssues.length}件のテナントで課金状態の不整合があります`,
        detail: billingIssues.map((t: any) => `${t.name} (${t.plan_tier})`).join(", "),
      });
    }
    if (heavyAccessors.length > 0) {
      alerts.push({
        level: "warning",
        message: `${heavyAccessors.length}件の保険会社で24h内にアクセス数が多い`,
        detail: heavyAccessors.map((a) => `${a.insurerId}: ${a.count}件`).join(", "),
      });
    }
    if (pendingAgents > 0) {
      alerts.push({
        level: "info",
        message: `${pendingAgents}件の代理店申請が承認待ちです`,
      });
    }
    if (certs24h === 0) {
      alerts.push({
        level: "info",
        message: "直近24時間で証明書の発行がありません",
      });
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      systemHealth: {
        status: billingIssues.length > 0 ? "warning" : "healthy",
        database: "connected",
        webhooks24h,
        certs24h,
      },
      tenants: {
        total: tenants.length,
        active: activeTenants.length,
        inactive: inactiveTenants.length,
        recentSignups: recentTenants.length,
        planDistribution,
      },
      users: {
        totalMembers: totalUsers,
        totalInsurers,
        pendingAgents,
      },
      certificates: {
        total: totalCerts,
        last24h: certs24h,
      },
      billing: {
        issues: billingIssues.map((t: any) => ({
          id: t.id,
          name: t.name,
          planTier: t.plan_tier,
          subscriptionId: t.stripe_subscription_id,
        })),
      },
      security: {
        heavyAccessors,
      },
      alerts,
      recentActivity: recentCerts.map((c: any) => ({
        publicId: c.public_id,
        customerName: c.customer_name,
        status: c.status,
        tenantId: c.tenant_id,
        createdAt: c.created_at,
      })),
    });
  } catch (e: unknown) {
    return apiInternalError(e, "GET /api/admin/platform/operations");
  }
}
