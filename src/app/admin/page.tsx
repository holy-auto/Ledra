import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCharts from "./DashboardCharts";

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  return data?.tenant_id as string | null;
}

type DashboardStats = {
  totalCerts: number;
  activeCerts: number;
  voidCerts: number;
  memberCount: number;
  customerCount: number;
  invoiceCount: number;
  unpaidAmount: number;
  recentActivity: { date: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  // Reservations & orders
  todayReservations: number;
  activeReservations: number;
  activeOrders: number;
  // Platform-wide
  platformCertStats: { total: number; active: number; void: number; expired: number; draft: number } | null;
  categoryStats: { category: string; count: number }[] | null;
  insurerCount: number;
  regionalStats: { prefecture: string; count: number }[] | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  detailing: "ディテイリング",
  maintenance: "整備",
  custom: "カスタム",
  bodywork: "板金",
  unset: "未設定",
};

async function fetchStats(supabase: any, tenantId: string): Promise<DashboardStats> {
  // 証明書の総数・ステータス別
  const { data: certs } = await supabase
    .from("certificates")
    .select("status,created_at")
    .eq("tenant_id", tenantId);

  const allCerts = certs ?? [];
  const totalCerts = allCerts.length;
  const activeCerts = allCerts.filter((c: any) => c.status === "active").length;
  const voidCerts = allCerts.filter((c: any) => c.status === "void").length;

  // ステータス別集計
  const statusMap = new Map<string, number>();
  for (const c of allCerts) {
    const s = c.status ?? "unknown";
    statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
  }
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  // 直近30日の発行数（日別）
  const dateMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    dateMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const c of allCerts) {
    if (!c.created_at) continue;
    const date = c.created_at.slice(0, 10);
    if (dateMap.has(date)) {
      dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
    }
  }
  const recentActivity = Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));

  // メンバー数
  const { count: memberCount } = await supabase
    .from("tenant_memberships")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  // 顧客数
  const { count: customerCount } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  // 請求書統計
  const { data: invoices } = await supabase
    .from("invoices")
    .select("status,total")
    .eq("tenant_id", tenantId);

  const invoiceList = invoices ?? [];
  const invoiceCount = invoiceList.length;
  const unpaidAmount = invoiceList
    .filter((inv: any) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum: number, inv: any) => sum + (inv.total ?? 0), 0);

  // 予約統計
  const today = new Date().toISOString().slice(0, 10);
  let todayReservations = 0;
  let activeReservations = 0;
  try {
    const { count: todayCount } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("scheduled_date", today)
      .neq("status", "cancelled");
    todayReservations = todayCount ?? 0;

    const { count: activeCount } = await supabase
      .from("reservations")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "arrived", "in_progress"]);
    activeReservations = activeCount ?? 0;
  } catch { /* reservations table may not exist yet */ }

  // 受発注統計
  let activeOrders = 0;
  try {
    const { count: ordCount } = await supabase
      .from("job_orders")
      .select("*", { count: "exact", head: true })
      .or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`)
      .in("status", ["pending", "accepted", "in_progress"]);
    activeOrders = ordCount ?? 0;
  } catch { /* job_orders table may not exist yet */ }

  // プラットフォーム全体統計（RPC）
  let platformCertStats = null;
  let categoryStats = null;
  let insurerCount = 0;
  let regionalStats = null;

  try {
    const { data: pcs } = await supabase.rpc("platform_certificate_stats");
    platformCertStats = pcs ?? null;
  } catch { /* RPC未実行の場合は null */ }

  try {
    const { data: cs } = await supabase.rpc("platform_tenant_category_stats");
    categoryStats = cs ?? null;
  } catch { /* */ }

  try {
    const { data: ic } = await supabase.rpc("platform_insurer_count");
    insurerCount = ic ?? 0;
  } catch { /* */ }

  try {
    const { data: rs } = await supabase.rpc("platform_regional_stats");
    regionalStats = rs ?? null;
  } catch { /* */ }

  return {
    totalCerts,
    activeCerts,
    voidCerts,
    memberCount: memberCount ?? 0,
    customerCount: customerCount ?? 0,
    invoiceCount,
    unpaidAmount,
    recentActivity,
    statusBreakdown,
    todayReservations,
    activeReservations,
    activeOrders,
    platformCertStats,
    categoryStats,
    insurerCount,
    regionalStats,
  };
}

export default async function AdminHome() {
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin");

  const tenantId = await getMyTenantId(supabase);

  let stats: DashboardStats | null = null;
  if (tenantId) {
    try {
      stats = await fetchStats(supabase, tenantId);
    } catch {
      stats = null;
    }
  }

  return (
    <main className="space-y-6">
      <PageHeader tag="DASHBOARD" title="ダッシュボード" description="施工証明書の管理状況を一目で確認" />

      {/* My Tenant Stats */}
      {stats && (
        <>
          <div>
            <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">MY SHOP</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">TOTAL</div>
                <div className="mt-2 text-3xl font-bold text-primary">{stats.totalCerts}</div>
                <div className="mt-1 text-xs text-muted">施工証明書 総数</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">ACTIVE</div>
                <div className="mt-2 text-3xl font-bold text-[#28a745]">{stats.activeCerts}</div>
                <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">VOID</div>
                <div className="mt-2 text-3xl font-bold text-[#d1242f]">{stats.voidCerts}</div>
                <div className="mt-1 text-xs text-muted">無効の施工証明書</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">MEMBERS</div>
                <div className="mt-2 text-3xl font-bold text-[#0071e3]">{stats.memberCount}</div>
                <div className="mt-1 text-xs text-muted">チームメンバー</div>
              </div>
            </div>
          </div>

          {/* Reservations & Orders */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">TODAY</div>
              <div className="mt-2 text-2xl font-bold text-[#5856d6]">{stats.todayReservations}</div>
              <div className="mt-1 text-xs text-muted">本日の予約</div>
            </Link>
            <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">IN PROGRESS</div>
              <div className="mt-2 text-2xl font-bold text-[#0071e3]">{stats.activeReservations}</div>
              <div className="mt-1 text-xs text-muted">進行中の予約・作業</div>
            </Link>
            <Link href="/admin/orders" className="glass-card p-5 hover:bg-surface-hover transition-colors">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">ORDERS</div>
              <div className="mt-2 text-2xl font-bold text-[#b35c00]">{stats.activeOrders}</div>
              <div className="mt-1 text-xs text-muted">進行中の受発注</div>
            </Link>
          </div>

          {/* Tenant sub-stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">CUSTOMERS</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.customerCount}</div>
              <div className="mt-1 text-xs text-muted">顧客数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">INVOICES</div>
              <div className="mt-2 text-2xl font-bold text-primary">{stats.invoiceCount}</div>
              <div className="mt-1 text-xs text-muted">請求書数</div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">UNPAID</div>
              <div className="mt-2 text-2xl font-bold text-[#b35c00]">¥{stats.unpaidAmount.toLocaleString()}</div>
              <div className="mt-1 text-xs text-muted">未回収額</div>
            </div>
          </div>
        </>
      )}

      {/* Charts */}
      {stats && (
        <DashboardCharts
          recentActivity={stats.recentActivity}
          statusBreakdown={stats.statusBreakdown}
        />
      )}

      {/* Platform-wide Stats */}
      {stats && (stats.platformCertStats || stats.categoryStats || stats.insurerCount > 0) && (
        <div>
          <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">PLATFORM OVERVIEW</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.platformCertStats && (
              <>
                <div className="glass-card p-5">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体証明書</div>
                  <div className="mt-2 text-3xl font-bold text-primary">{stats.platformCertStats.total}</div>
                  <div className="mt-1 text-xs text-muted">プラットフォーム全体</div>
                </div>
                <div className="glass-card p-5">
                  <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体 有効</div>
                  <div className="mt-2 text-3xl font-bold text-[#28a745]">{stats.platformCertStats.active}</div>
                  <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
                </div>
              </>
            )}
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">INSURERS</div>
              <div className="mt-2 text-3xl font-bold text-[#bf5af2]">{stats.insurerCount}</div>
              <div className="mt-1 text-xs text-muted">保険会社数</div>
            </div>
          </div>
        </div>
      )}

      {/* Category & Regional Breakdown */}
      {stats && (stats.categoryStats || stats.regionalStats) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 業種別施工店数 */}
          {stats.categoryStats && stats.categoryStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">SHOP CATEGORIES</div>
              <div className="text-base font-semibold text-primary mb-4">業種別 施工店数</div>
              <div className="space-y-3">
                {stats.categoryStats.map((cat: any) => {
                  const total = stats!.categoryStats!.reduce((s: number, c: any) => s + c.count, 0);
                  const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
                  return (
                    <div key={cat.category}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-secondary">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
                        <span className="text-sm font-semibold text-primary">{cat.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#0071e3] to-[#5e5ce6]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 地域別 */}
          {stats.regionalStats && stats.regionalStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">REGIONS</div>
              <div className="text-base font-semibold text-primary mb-4">地域別 施工店数</div>
              <div className="space-y-3">
                {stats.regionalStats.slice(0, 10).map((reg: any) => {
                  const total = stats!.regionalStats!.reduce((s: number, r: any) => s + r.count, 0);
                  const pct = total > 0 ? Math.round((reg.count / total) * 100) : 0;
                  return (
                    <div key={reg.prefecture}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-secondary">{reg.prefecture}</span>
                        <span className="text-sm font-semibold text-primary">{reg.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#30d158] to-[#34c759]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold tracking-[0.18em] text-muted mb-3">QUICK ACTIONS</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/certificates"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#0071e3]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#0077ED] transition-colors">証明書一覧</div>
              <div className="text-xs text-muted">Certificates</div>
            </div>
          </Link>

          <Link
            href="/admin/certificates/new"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#28a745]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#28a745] transition-colors">新規発行</div>
              <div className="text-xs text-muted">New Certificate</div>
            </div>
          </Link>

          <Link
            href="/admin/customers"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#0071e3]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#0077ED] transition-colors">顧客管理</div>
              <div className="text-xs text-muted">Customers</div>
            </div>
          </Link>

          <Link
            href="/admin/invoices"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#b35c00]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#b35c00] transition-colors">請求書</div>
              <div className="text-xs text-muted">Invoices</div>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#b35c00]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#b35c00] transition-colors">請求・プラン</div>
              <div className="text-xs text-muted">Billing</div>
            </div>
          </Link>

          <Link
            href="/admin/templates"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-[#0071e3]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-[#0077ED] transition-colors">テンプレート</div>
              <div className="text-xs text-muted">Templates</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
