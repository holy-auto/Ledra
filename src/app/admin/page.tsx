import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCharts from "./DashboardCharts";

const CATEGORY_LABELS: Record<string, string> = {
  detailing: "ディテイリング",
  maintenance: "整備",
  custom: "カスタム",
  bodywork: "板金",
  unset: "未設定",
};

function StatSkeleton() {
  return (
    <div className="animate-pulse grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-5 space-y-2">
          <div className="h-3 w-16 rounded bg-surface-hover" />
          <div className="h-8 w-20 rounded bg-surface-hover" />
          <div className="h-3 w-24 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

// ── Tenant Stats Section ──
async function TenantStats({ tenantId }: { tenantId: string }) {
  const supabase = await createSupabaseServerClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: certs },
    { count: memberCount },
    { count: customerCount },
    { data: invoices },
    todayResResult,
    activeResResult,
    ordersResult,
  ] = await Promise.all([
    supabase.from("certificates").select("status,created_at").eq("tenant_id", tenantId),
    supabase.from("tenant_memberships").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("customers").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("invoices").select("status,total").eq("tenant_id", tenantId),
    Promise.resolve(supabase.from("reservations").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("scheduled_date", today).neq("status", "cancelled")).catch(() => ({ count: 0 })),
    Promise.resolve(supabase.from("reservations").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["confirmed", "arrived", "in_progress"])).catch(() => ({ count: 0 })),
    Promise.resolve(supabase.from("job_orders").select("*", { count: "exact", head: true }).or(`from_tenant_id.eq.${tenantId},to_tenant_id.eq.${tenantId}`).in("status", ["pending", "accepted", "in_progress"])).catch(() => ({ count: 0 })),
  ]);

  const allCerts = certs ?? [];
  const totalCerts = allCerts.length;
  const activeCerts = allCerts.filter((c: any) => c.status === "active").length;
  const voidCerts = allCerts.filter((c: any) => c.status === "void").length;

  const statusMap = new Map<string, number>();
  for (const c of allCerts) {
    const s = c.status ?? "unknown";
    statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
  }
  const statusBreakdown = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

  const dateMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    dateMap.set(d.toISOString().slice(0, 10), 0);
  }
  for (const c of allCerts) {
    if (!c.created_at) continue;
    const date = c.created_at.slice(0, 10);
    if (dateMap.has(date)) dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
  }
  const recentActivity = Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));

  const invoiceList = invoices ?? [];
  const invoiceCount = invoiceList.length;
  const unpaidAmount = invoiceList
    .filter((inv: any) => inv.status === "sent" || inv.status === "overdue")
    .reduce((sum: number, inv: any) => sum + (inv.total ?? 0), 0);

  return (
    <>
      <div>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">自店舗</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
            <div className="mt-2 text-3xl font-bold text-primary">{totalCerts}</div>
            <div className="mt-1 text-xs text-muted">施工証明書 総数</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">有効</div>
            <div className="mt-2 text-3xl font-bold text-success">{activeCerts}</div>
            <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">無効</div>
            <div className="mt-2 text-3xl font-bold text-danger">{voidCerts}</div>
            <div className="mt-1 text-xs text-muted">無効の施工証明書</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー</div>
            <div className="mt-2 text-3xl font-bold text-accent">{memberCount ?? 0}</div>
            <div className="mt-1 text-xs text-muted">チームメンバー</div>
          </div>
        </div>
      </div>

      {/* Reservations & Orders */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">本日</div>
          <div className="mt-2 text-2xl font-bold text-violet-text">{todayResResult?.count ?? 0}</div>
          <div className="mt-1 text-xs text-muted">本日の予約</div>
        </Link>
        <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">進行中</div>
          <div className="mt-2 text-2xl font-bold text-accent">{activeResResult?.count ?? 0}</div>
          <div className="mt-1 text-xs text-muted">進行中の予約・作業</div>
        </Link>
        <Link href="/admin/orders" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">受発注</div>
          <div className="mt-2 text-2xl font-bold text-warning">{ordersResult?.count ?? 0}</div>
          <div className="mt-1 text-xs text-muted">進行中の受発注</div>
        </Link>
      </div>

      {/* Tenant sub-stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">顧客</div>
          <div className="mt-2 text-2xl font-bold text-primary">{customerCount ?? 0}</div>
          <div className="mt-1 text-xs text-muted">顧客数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">請求書</div>
          <div className="mt-2 text-2xl font-bold text-primary">{invoiceCount}</div>
          <div className="mt-1 text-xs text-muted">請求書数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">未回収</div>
          <div className="mt-2 text-2xl font-bold text-warning">¥{unpaidAmount.toLocaleString()}</div>
          <div className="mt-1 text-xs text-muted">未回収額</div>
        </div>
      </div>

      {/* Charts */}
      <DashboardCharts recentActivity={recentActivity} statusBreakdown={statusBreakdown} />
    </>
  );
}

// ── Platform Stats Section ──
async function PlatformStats() {
  const supabase = await createSupabaseServerClient();

  const [pcsResult, csResult, icResult, rsResult] = await Promise.all([
    Promise.resolve(supabase.rpc("platform_certificate_stats")).catch(() => ({ data: null })),
    Promise.resolve(supabase.rpc("platform_tenant_category_stats")).catch(() => ({ data: null })),
    Promise.resolve(supabase.rpc("platform_insurer_count")).catch(() => ({ data: 0 })),
    Promise.resolve(supabase.rpc("platform_regional_stats")).catch(() => ({ data: null })),
  ]);

  const platformCertStats = pcsResult?.data ?? null;
  const categoryStats = csResult?.data ?? null;
  const insurerCount = icResult?.data ?? 0;
  const regionalStats = rsResult?.data ?? null;

  if (!platformCertStats && !categoryStats && insurerCount <= 0) return null;

  return (
    <>
      <div>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">プラットフォーム全体</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCertStats && (
            <>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体証明書</div>
                <div className="mt-2 text-3xl font-bold text-primary">{platformCertStats.total}</div>
                <div className="mt-1 text-xs text-muted">プラットフォーム全体</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体 有効</div>
                <div className="mt-2 text-3xl font-bold text-success">{platformCertStats.active}</div>
                <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
              </div>
            </>
          )}
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">保険会社</div>
            <div className="mt-2 text-3xl font-bold text-violet-text">{insurerCount}</div>
            <div className="mt-1 text-xs text-muted">保険会社数</div>
          </div>
        </div>
      </div>

      {/* Category & Regional Breakdown */}
      {(categoryStats || regionalStats) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {categoryStats && categoryStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">業種別</div>
              <div className="text-base font-semibold text-primary mb-4">業種別 施工店数</div>
              <div className="space-y-3">
                {(() => {
                  const categoryTotal = categoryStats.reduce((s: number, c: any) => s + c.count, 0);
                  return categoryStats.map((cat: any) => {
                    const pct = categoryTotal > 0 ? Math.round((cat.count / categoryTotal) * 100) : 0;
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-secondary">{CATEGORY_LABELS[cat.category] ?? cat.category}</span>
                          <span className="text-sm font-semibold text-primary">{cat.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {regionalStats && regionalStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">地域別</div>
              <div className="text-base font-semibold text-primary mb-4">地域別 施工店数</div>
              <div className="space-y-3">
                {(() => {
                  const regionalTotal = regionalStats.reduce((s: number, r: any) => s + r.count, 0);
                  return regionalStats.slice(0, 10).map((reg: any) => {
                    const pct = regionalTotal > 0 ? Math.round((reg.count / regionalTotal) * 100) : 0;
                    return (
                      <div key={reg.prefecture}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-secondary">{reg.prefecture}</span>
                          <span className="text-sm font-semibold text-primary">{reg.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-success to-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default async function AdminHome() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin");

  const tenantId = caller.tenantId;

  return (
    <div className="space-y-6">
      <PageHeader tag="管理画面" title="ダッシュボード" description="施工証明書の管理状況を一目で確認" />

      {/* Tenant Stats - streams in first */}
      {tenantId && (
        <Suspense fallback={<StatSkeleton />}>
          <TenantStats tenantId={tenantId} />
        </Suspense>
      )}

      {/* Platform Stats - streams independently */}
      <Suspense fallback={<StatSkeleton />}>
        <PlatformStats />
      </Suspense>

      {/* Getting Started */}
      <div className="glass-card p-5 flex items-start gap-4 border-l-4 border-accent">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-dim">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-accent">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
        </span>
        <div className="space-y-1">
          <div className="text-sm font-semibold text-primary">はじめての方へ</div>
          <p className="text-xs text-muted leading-relaxed">
            CARTRUSTへようこそ！まずは<Link href="/admin/settings" className="text-accent hover:underline">店舗設定</Link>を完了し、
            <Link href="/admin/certificates/new" className="text-accent hover:underline">最初の証明書を発行</Link>してみましょう。
            ご不明な点は<Link href="/faq" className="text-accent hover:underline">よくある質問</Link>または
            <Link href="/contact" className="text-accent hover:underline">お問い合わせ</Link>をご利用ください。
          </p>
        </div>
      </div>

      {/* Quick Actions - renders immediately (no data fetching) */}
      <div>
        <h2 className="text-sm font-semibold tracking-[0.18em] text-muted mb-3">クイックアクション</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/certificates"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-accent">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">証明書一覧</div>
              <div className="text-xs text-muted">証明書の管理・検索</div>
            </div>
          </Link>

          <Link
            href="/admin/certificates/new"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-success">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-success transition-colors">新規発行</div>
              <div className="text-xs text-muted">施工証明書を発行</div>
            </div>
          </Link>

          <Link
            href="/admin/customers"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-accent">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">顧客管理</div>
              <div className="text-xs text-muted">顧客情報の登録・編集</div>
            </div>
          </Link>

          <Link
            href="/admin/invoices"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-warning">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-warning transition-colors">請求書</div>
              <div className="text-xs text-muted">請求書の作成・管理</div>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-warning">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-warning transition-colors">請求・プラン</div>
              <div className="text-xs text-muted">課金状況の確認</div>
            </div>
          </Link>

          <Link
            href="/admin/templates"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-accent">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">テンプレート</div>
              <div className="text-xs text-muted">証明書テンプレートの管理</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
