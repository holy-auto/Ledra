"use client";

import { useEffect, useState, useCallback } from "react";
import Badge from "@/components/ui/Badge";

// ── Types ──
type SystemHealth = {
  status: string;
  database: string;
  webhooks24h: number;
  certs24h: number;
};

type TenantOverview = {
  total: number;
  active: number;
  inactive: number;
  recentSignups: number;
  planDistribution: Record<string, number>;
};

type UserOverview = {
  totalMembers: number;
  totalInsurers: number;
  pendingAgents: number;
};

type Alert = {
  level: "error" | "warning" | "info";
  message: string;
  detail?: string;
};

type BillingIssue = {
  id: string;
  name: string;
  planTier: string;
  subscriptionId: string;
};

type HeavyAccessor = {
  insurerId: string;
  count: number;
};

type RecentActivity = {
  publicId: string;
  customerName: string;
  status: string;
  tenantId: string;
  createdAt: string;
};

type TenantDetail = {
  id: string;
  name: string;
  plan_tier: string;
  is_active: boolean;
  category: string | null;
  prefecture: string | null;
  created_at: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  memberCount: number;
  certCount: number;
};

type SecurityData = {
  access: {
    totalLogs: number;
    suspiciousIps: { ip: string; count: number }[];
    topAccessors: { insurerId: string; count: number }[];
    recentLogs: any[];
  };
  webhooks: {
    total: number;
    typeDistribution: Record<string, number>;
  };
  piiDisclosure: {
    total: number;
    recentLogs: any[];
  };
};

type OperationsData = {
  ok: boolean;
  timestamp: string;
  systemHealth: SystemHealth;
  tenants: TenantOverview;
  users: UserOverview;
  certificates: { total: number; last24h: number };
  billing: { issues: BillingIssue[] };
  security: { heavyAccessors: HeavyAccessor[] };
  alerts: Alert[];
  recentActivity: RecentActivity[];
};

// ── Tab definitions ──
type TabKey = "overview" | "tenants" | "security" | "actions";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "システム概要" },
  { key: "tenants", label: "テナント管理" },
  { key: "security", label: "セキュリティ監査" },
  { key: "actions", label: "遠隔操作" },
];

// ── Plan label ──
const PLAN_LABELS: Record<string, string> = {
  free: "フリー",
  starter: "スターター",
  standard: "スタンダード",
  pro: "プロ",
  enterprise: "エンタープライズ",
};

// ── Status badge variant ──
function alertVariant(level: string) {
  if (level === "error") return "danger" as const;
  if (level === "warning") return "warning" as const;
  return "info" as const;
}

function healthColor(status: string) {
  if (status === "healthy") return "text-success";
  if (status === "warning") return "text-warning";
  return "text-danger";
}

function healthLabel(status: string) {
  if (status === "healthy") return "正常";
  if (status === "warning") return "注意";
  return "異常";
}

// ── Formatters ──
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtShortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
  });
}

// ════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════
export default function PlatformOperationsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/platform/operations");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "unknown error");
      setData(json);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message ?? "データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60 seconds
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return <LoadingSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <div className="text-danger font-semibold">エラーが発生しました</div>
        <div className="text-sm text-muted">{error}</div>
        <button onClick={fetchData} className="btn-primary">再試行</button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`inline-flex h-2.5 w-2.5 rounded-full ${data.systemHealth.status === "healthy" ? "bg-success" : data.systemHealth.status === "warning" ? "bg-warning" : "bg-danger"}`} />
          <span className={`text-sm font-semibold ${healthColor(data.systemHealth.status)}`}>
            システム: {healthLabel(data.systemHealth.status)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted">
              最終更新: {lastRefresh.toLocaleTimeString("ja-JP")}
            </span>
          )}
          <button onClick={fetchData} disabled={loading} className="btn-secondary text-xs px-3 py-1.5">
            {loading ? "更新中..." : "更新"}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 && (
        <div className="space-y-2">
          {data.alerts.map((alert, i) => (
            <div
              key={i}
              className={`glass-card p-4 border-l-4 ${
                alert.level === "error"
                  ? "border-danger"
                  : alert.level === "warning"
                  ? "border-warning"
                  : "border-accent"
              }`}
            >
              <div className="flex items-start gap-3">
                <Badge variant={alertVariant(alert.level)}>
                  {alert.level === "error" ? "エラー" : alert.level === "warning" ? "警告" : "情報"}
                </Badge>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-primary">{alert.message}</div>
                  {alert.detail && <div className="text-xs text-muted mt-1">{alert.detail}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-border-subtle">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-muted hover:text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab data={data} />}
      {activeTab === "tenants" && <TenantsTab />}
      {activeTab === "security" && <SecurityTab />}
      {activeTab === "actions" && <ActionsTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Overview Tab
// ════════════════════════════════════════════════════════════════
function OverviewTab({ data }: { data: OperationsData }) {
  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="テナント数" value={data.tenants.total} sub={`アクティブ: ${data.tenants.active}`} color="text-primary" />
        <StatCard label="ユーザー数" value={data.users.totalMembers} sub={`保険会社: ${data.users.totalInsurers}`} color="text-accent" />
        <StatCard label="証明書 (全体)" value={data.certificates.total} sub={`24h: +${data.certificates.last24h}`} color="text-success" />
        <StatCard label="Webhook (24h)" value={data.systemHealth.webhooks24h} sub={`DB: ${data.systemHealth.database}`} color="text-violet-text" />
      </div>

      {/* Tenant metrics */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Plan distribution */}
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">プラン分布</div>
          <div className="text-base font-semibold text-primary mb-4">テナントプラン別内訳</div>
          <div className="space-y-3">
            {Object.entries(data.tenants.planDistribution).map(([plan, count]) => {
              const pct = data.tenants.total > 0 ? Math.round((count / data.tenants.total) * 100) : 0;
              return (
                <div key={plan}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-secondary">{PLAN_LABELS[plan] ?? plan}</span>
                    <span className="text-sm font-semibold text-primary">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-active overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick stats */}
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">運営サマリー</div>
          <div className="text-base font-semibold text-primary mb-4">システム状況</div>
          <div className="space-y-3">
            <QuickStat label="非アクティブテナント" value={data.tenants.inactive} variant={data.tenants.inactive > 0 ? "warning" : "default"} />
            <QuickStat label="今週の新規テナント" value={data.tenants.recentSignups} variant="default" />
            <QuickStat label="代理店申請 (承認待ち)" value={data.users.pendingAgents} variant={data.users.pendingAgents > 0 ? "warning" : "default"} />
            <QuickStat label="課金不整合" value={data.billing.issues.length} variant={data.billing.issues.length > 0 ? "danger" : "default"} />
            <QuickStat label="高アクセス保険会社" value={data.security.heavyAccessors.length} variant={data.security.heavyAccessors.length > 0 ? "warning" : "default"} />
          </div>
        </div>
      </div>

      {/* Billing issues */}
      {data.billing.issues.length > 0 && (
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">要対応</div>
          <div className="text-base font-semibold text-danger mb-4">課金不整合テナント</div>
          <div className="divide-y divide-border-subtle">
            {data.billing.issues.map((issue) => (
              <div key={issue.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-primary">{issue.name}</div>
                  <div className="text-xs text-muted font-mono">{issue.id.slice(0, 12)}...</div>
                </div>
                <div className="text-right">
                  <Badge variant="warning">{PLAN_LABELS[issue.planTier] ?? issue.planTier}</Badge>
                  <div className="text-xs text-muted mt-1">Subscription あり / is_active=false</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="glass-card">
        <div className="p-5 border-b border-border-subtle">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">最近の活動</div>
          <div className="mt-1 text-base font-semibold text-primary">直近の証明書発行</div>
        </div>
        {data.recentActivity.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">最近の活動はありません</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {data.recentActivity.slice(0, 10).map((item) => (
              <div key={item.publicId} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={item.status === "active" ? "success" : item.status === "void" ? "danger" : "default"}>
                    {item.status}
                  </Badge>
                  <div>
                    <div className="text-sm text-primary">{item.customerName || "—"}</div>
                    <div className="text-xs text-muted font-mono">{item.publicId?.slice(0, 12)}...</div>
                  </div>
                </div>
                <div className="text-xs text-muted">{fmtDate(item.createdAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tenants Tab
// ════════════════════════════════════════════════════════════════
function TenantsTab() {
  const [tenants, setTenants] = useState<TenantDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/platform/tenants?${params}`);
      const json = await res.json();
      if (json.ok) {
        setTenants(json.tenants);
        setTotal(json.total);
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, page]);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="glass-card p-4">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="min-w-[200px] space-y-1">
            <label className="text-xs text-muted">テナント名検索</label>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="名前で検索..."
              className="input-field"
            />
          </div>
          <div className="min-w-[140px] space-y-1">
            <label className="text-xs text-muted">ステータス</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="input-field"
            >
              <option value="">すべて</option>
              <option value="active">アクティブ</option>
              <option value="inactive">非アクティブ</option>
            </select>
          </div>
          <button onClick={fetchTenants} className="btn-primary">検索</button>
        </div>
      </div>

      {/* Tenant count */}
      <div className="text-xs text-muted">
        {total}件中 {tenants.length}件表示
      </div>

      {/* Tenant list */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted">読み込み中...</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">テナントが見つかりません</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-hover">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">テナント名</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">プラン</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted">状態</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted">メンバー</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted">証明書</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">地域</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted">登録日</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {tenants.map((t) => (
                  <TenantRow key={t.id} tenant={t} onRefresh={fetchTenants} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            前へ
          </button>
          <span className="text-xs text-muted self-center">ページ {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={tenants.length < 50}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}

function TenantRow({ tenant, onRefresh }: { tenant: TenantDetail; onRefresh: () => void }) {
  const [acting, setActing] = useState(false);

  async function doAction(action: string, params?: Record<string, unknown>) {
    if (!confirm(`${tenant.name} に対して「${action}」を実行しますか？`)) return;
    setActing(true);
    try {
      const res = await fetch("/api/admin/platform/tenant-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenant.id, action, params }),
      });
      const json = await res.json();
      if (json.ok) {
        alert(json.message ?? "完了しました");
        onRefresh();
      } else {
        alert(`エラー: ${json.message ?? json.error}`);
      }
    } catch {
      alert("操作に失敗しました");
    } finally {
      setActing(false);
    }
  }

  return (
    <tr className="hover:bg-surface-hover transition-colors">
      <td className="px-4 py-3">
        <div className="font-semibold text-primary">{tenant.name}</div>
        <div className="text-xs text-muted font-mono">{tenant.id.slice(0, 12)}...</div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={tenant.plan_tier === "pro" ? "violet" : tenant.plan_tier === "free" ? "default" : "info"}>
          {PLAN_LABELS[tenant.plan_tier] ?? tenant.plan_tier}
        </Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant={tenant.is_active ? "success" : "danger"}>
          {tenant.is_active ? "有効" : "無効"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right font-mono">{tenant.memberCount}</td>
      <td className="px-4 py-3 text-right font-mono">{tenant.certCount}</td>
      <td className="px-4 py-3 text-xs text-muted">{tenant.prefecture ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-muted">{fmtShortDate(tenant.created_at)}</td>
      <td className="px-4 py-3 text-center">
        <div className="flex gap-1 justify-center">
          {tenant.is_active ? (
            <button
              onClick={() => doAction("deactivate")}
              disabled={acting}
              className="text-[11px] px-2 py-1 rounded bg-danger/10 text-danger hover:bg-danger/20 transition-colors"
            >
              停止
            </button>
          ) : (
            <button
              onClick={() => doAction("activate")}
              disabled={acting}
              className="text-[11px] px-2 py-1 rounded bg-success/10 text-success hover:bg-success/20 transition-colors"
            >
              有効化
            </button>
          )}
          <button
            onClick={() => doAction("reset_billing")}
            disabled={acting}
            className="text-[11px] px-2 py-1 rounded bg-warning/10 text-warning hover:bg-warning/20 transition-colors"
          >
            課金修正
          </button>
        </div>
      </td>
    </tr>
  );
}

// ════════════════════════════════════════════════════════════════
// Security Tab
// ════════════════════════════════════════════════════════════════
function SecurityTab() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchSecurity = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/platform/security-audit?days=${days}`);
      const json = await res.json();
      if (json.ok) setData(json);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchSecurity(); }, [fetchSecurity]);

  if (loading && !data) return <LoadingSkeleton />;
  if (!data) return <div className="text-sm text-muted">データの取得に失敗しました</div>;

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-muted">期間:</label>
        {[1, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-xs px-3 py-1.5 rounded transition-colors ${
              days === d ? "bg-accent text-white" : "bg-surface-hover text-muted hover:text-primary"
            }`}
          >
            {d}日
          </button>
        ))}
      </div>

      {/* Security overview cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="アクセスログ" value={data.access.totalLogs} sub={`${days}日間`} color="text-primary" />
        <StatCard label="Webhookイベント" value={data.webhooks.total} sub={`${days}日間`} color="text-accent" />
        <StatCard label="PII開示ログ" value={data.piiDisclosure.total} sub={`${days}日間`} color="text-warning" />
      </div>

      {/* Suspicious IPs */}
      {data.access.suspiciousIps.length > 0 && (
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">要注意</div>
          <div className="text-base font-semibold text-danger mb-4">
            不審なIPアドレス ({data.access.suspiciousIps.length}件)
          </div>
          <div className="space-y-2">
            {data.access.suspiciousIps.map((ip) => (
              <div key={ip.ip} className="flex items-center justify-between p-3 rounded-lg bg-surface-hover">
                <span className="text-sm font-mono text-primary">{ip.ip}</span>
                <Badge variant="danger">{ip.count}回</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top accessors */}
      <div className="glass-card p-5">
        <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">アクセスランキング</div>
        <div className="text-base font-semibold text-primary mb-4">
          保険会社アクセス上位
        </div>
        {data.access.topAccessors.length === 0 ? (
          <div className="text-sm text-muted">データがありません</div>
        ) : (
          <div className="space-y-2">
            {data.access.topAccessors.map((acc, i) => (
              <div key={acc.insurerId} className="flex items-center justify-between p-3 rounded-lg bg-surface-hover">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted font-mono">#{i + 1}</span>
                  <span className="text-sm font-mono text-primary">{acc.insurerId.slice(0, 12)}...</span>
                </div>
                <Badge variant={acc.count > 200 ? "danger" : acc.count > 100 ? "warning" : "default"}>
                  {acc.count}回
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook distribution */}
      {Object.keys(data.webhooks.typeDistribution).length > 0 && (
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">Stripe</div>
          <div className="text-base font-semibold text-primary mb-4">
            Webhookイベント種別
          </div>
          <div className="space-y-2">
            {Object.entries(data.webhooks.typeDistribution)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 15)
              .map(([type, count]) => (
                <div key={type} className="flex items-center justify-between p-2">
                  <span className="text-xs font-mono text-secondary">{type}</span>
                  <span className="text-xs font-mono font-semibold text-primary">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent PII disclosure */}
      {data.piiDisclosure.recentLogs.length > 0 && (
        <div className="glass-card">
          <div className="p-5 border-b border-border-subtle">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">監査</div>
            <div className="mt-1 text-base font-semibold text-primary">PII開示ログ (直近)</div>
          </div>
          <div className="divide-y divide-border-subtle">
            {data.piiDisclosure.recentLogs.slice(0, 20).map((log: any) => (
              <div key={log.id} className="p-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted">
                    {log.action} / {log.target_type}
                  </div>
                  <div className="text-xs font-mono text-muted">
                    tenant: {log.tenant_id?.slice(0, 8)}... / user: {log.user_id?.slice(0, 8)}...
                  </div>
                </div>
                <div className="text-xs text-muted">{fmtDate(log.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Actions Tab
// ════════════════════════════════════════════════════════════════
function ActionsTab() {
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState<string>("activate");
  const [planTier, setPlanTier] = useState("pro");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  async function handleExecute() {
    if (!tenantId.trim()) {
      setResult("テナントIDを入力してください");
      return;
    }
    if (!confirm(`テナント ${tenantId.slice(0, 12)}... に対して「${action}」を実行しますか？`)) return;

    setExecuting(true);
    setResult(null);
    try {
      const params: Record<string, unknown> = {};
      if (action === "change_plan") params.plan_tier = planTier;
      if (action === "send_notification") params.message = message;

      const res = await fetch("/api/admin/platform/tenant-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: tenantId.trim(), action, params }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(`成功: ${json.message}`);
      } else {
        setResult(`エラー: ${json.message ?? json.error}`);
      }
    } catch {
      setResult("実行に失敗しました");
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-5 border-l-4 border-warning">
        <div className="flex items-start gap-3">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-warning shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div>
            <div className="text-sm font-semibold text-warning">遠隔操作エリア</div>
            <div className="text-xs text-muted mt-1">
              この操作はテナントに直接影響します。実行前に対象テナントを十分に確認してください。
              すべての操作は監査ログに記録されます。
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card p-5 space-y-4">
        <div className="text-base font-semibold text-primary">テナント遠隔操作</div>

        <div className="space-y-1">
          <label className="text-xs text-muted">テナントID</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="テナントIDを入力（UUIDまたは先頭部分）"
            className="input-field font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted">アクション</label>
          <select value={action} onChange={(e) => setAction(e.target.value)} className="input-field">
            <option value="activate">有効化 (activate)</option>
            <option value="deactivate">停止 (deactivate)</option>
            <option value="change_plan">プラン変更 (change_plan)</option>
            <option value="reset_billing">課金リセット (reset_billing)</option>
            <option value="send_notification">通知送信 (send_notification)</option>
          </select>
        </div>

        {action === "change_plan" && (
          <div className="space-y-1">
            <label className="text-xs text-muted">新しいプラン</label>
            <select value={planTier} onChange={(e) => setPlanTier(e.target.value)} className="input-field">
              <option value="free">フリー</option>
              <option value="starter">スターター</option>
              <option value="pro">プロ</option>
              <option value="enterprise">エンタープライズ</option>
            </select>
          </div>
        )}

        {action === "send_notification" && (
          <div className="space-y-1">
            <label className="text-xs text-muted">通知メッセージ</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="メンバー全員に送信するメッセージ"
              className="input-field min-h-[80px]"
            />
          </div>
        )}

        <div className="pt-2 flex items-center gap-3">
          <button
            onClick={handleExecute}
            disabled={executing}
            className="btn-primary"
          >
            {executing ? "実行中..." : "実行"}
          </button>
        </div>

        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.startsWith("成功") ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
            {result}
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Shared Components
// ════════════════════════════════════════════════════════════════
function StatCard({
  label,
  value,
  sub,
  color = "text-primary",
}: {
  label: string;
  value: number | string;
  sub: string;
  color?: string;
}) {
  return (
    <div className="glass-card p-5">
      <div className="text-xs font-semibold tracking-[0.18em] text-muted">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${color}`}>{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="mt-1 text-xs text-muted">{sub}</div>
    </div>
  );
}

function QuickStat({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "warning" | "danger";
}) {
  const color =
    variant === "danger" ? "text-danger" : variant === "warning" ? "text-warning" : "text-primary";
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-hover">
      <span className="text-sm text-secondary">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-5 space-y-2 animate-pulse">
            <div className="h-3 w-16 rounded bg-surface-hover" />
            <div className="h-8 w-20 rounded bg-surface-hover" />
            <div className="h-3 w-24 rounded bg-surface-hover" />
          </div>
        ))}
      </div>
      <div className="glass-card p-5 animate-pulse space-y-3">
        <div className="h-4 w-32 rounded bg-surface-hover" />
        <div className="h-20 w-full rounded bg-surface-hover" />
      </div>
    </div>
  );
}
