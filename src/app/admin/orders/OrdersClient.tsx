"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { formatJpy, formatDate } from "@/lib/format";

type OrderStatus =
  | "pending" | "quoting" | "accepted" | "in_progress"
  | "approval_pending" | "payment_pending" | "completed"
  | "rejected" | "cancelled";

interface OrderRow {
  id: string;
  order_number: string | null;
  from_tenant_id: string;
  to_tenant_id: string;
  from_company?: string;
  to_company?: string;
  title: string;
  description: string | null;
  category: string | null;
  budget: number | null;
  accepted_amount: number | null;
  deadline: string | null;
  status: OrderStatus;
  payment_status: string;
  created_at: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "申請中" },
  { value: "quoting", label: "見積中" },
  { value: "accepted", label: "受注" },
  { value: "in_progress", label: "作業中" },
  { value: "approval_pending", label: "検収待ち" },
  { value: "payment_pending", label: "支払待ち" },
  { value: "completed", label: "完了" },
  { value: "rejected", label: "辞退" },
  { value: "cancelled", label: "キャンセル" },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "sent", label: "発注（自社→他社）" },
  { value: "received", label: "受注（他社→自社）" },
];

const statusLabel = (s: OrderStatus): string => {
  const m: Record<OrderStatus, string> = {
    pending: "申請中",
    quoting: "見積中",
    accepted: "受注",
    in_progress: "作業中",
    approval_pending: "検収待ち",
    payment_pending: "支払待ち",
    completed: "完了",
    rejected: "辞退",
    cancelled: "キャンセル",
  };
  return m[s] ?? s;
};

const statusVariant = (s: OrderStatus): "default" | "success" | "warning" | "danger" | "info" => {
  const m: Record<OrderStatus, "default" | "success" | "warning" | "danger" | "info"> = {
    pending: "warning",
    quoting: "warning",
    accepted: "info",
    in_progress: "info",
    approval_pending: "warning",
    payment_pending: "warning",
    completed: "success",
    rejected: "danger",
    cancelled: "default",
  };
  return m[s] ?? "default";
};

const CATEGORY_OPTIONS = [
  "PPF施工", "コーティング", "板金塗装", "ラッピング", "ウィンドウフィルム",
  "インテリアリペア", "デントリペア", "その他",
];

interface TenantOption {
  tenant_id: string;
  tenant_name: string;
}

interface TenantSearchResult {
  tenant_id: string;
  company_name: string;
  slug: string;
  completed_orders: number;
  avg_rating: number | null;
}

export default function OrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);

  // テナント一覧
  const [myTenants, setMyTenants] = useState<TenantOption[]>([]);

  // テナント検索
  const [tenantQuery, setTenantQuery] = useState("");
  const [tenantResults, setTenantResults] = useState<TenantSearchResult[]>([]);
  const [searchingTenants, setSearchingTenants] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantSearchResult | null>(null);
  const [showTenantDropdown, setShowTenantDropdown] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // New order form
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    budget: "",
    deadline: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchOrders = useCallback(async (type?: string, status?: string) => {
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (type && type !== "all") params.set("type", type);
      if (status && status !== "all") params.set("status", status);
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setOrders(j.orders ?? []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/orders?_tenants=1", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (j?.myTenants?.length) setMyTenants(j.myTenants);
      } catch { /* ignore */ }
      await fetchOrders();
      setLoading(false);
    })();
  }, [fetchOrders]);

  // ─── テナント検索（debounce） ───
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!tenantQuery || tenantQuery.length < 1) {
      setTenantResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchingTenants(true);
      try {
        const res = await fetch(`/api/admin/tenants/search?q=${encodeURIComponent(tenantQuery)}`);
        const j = await res.json();
        setTenantResults(j.tenants ?? []);
        setShowTenantDropdown(true);
      } catch { /* ignore */ }
      setSearchingTenants(false);
    }, 300);
  }, [tenantQuery]);

  const applyFilters = (newType?: string, newStatus?: string) => {
    const t = newType ?? typeFilter;
    const s = newStatus ?? statusFilter;
    if (newType !== undefined) setTypeFilter(t);
    if (newStatus !== undefined) setStatusFilter(s);
    fetchOrders(t, s);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant || !formData.title) {
      alert("発注先と件名は必須です");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          to_tenant_id: selectedTenant.tenant_id,
          budget: formData.budget ? Number(formData.budget) : null,
          deadline: formData.deadline || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormData({ title: "", description: "", category: "", budget: "", deadline: "" });
      setSelectedTenant(null);
      setTenantQuery("");
      await fetchOrders(typeFilter, statusFilter);
    } catch (e: unknown) {
      alert("発注に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const pendingSent = orders.filter((o) => o.status === "pending" || o.status === "quoting").length;
  const activeCount = orders.filter((o) =>
    ["accepted", "in_progress", "approval_pending", "payment_pending"].includes(o.status),
  ).length;
  const completedCount = orders.filter((o) => o.status === "completed").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="受発注"
        title="受発注管理"
        description="他の施工店との仕事の受発注を管理します。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? "閉じる" : "新規発注"}
          </button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">申請中</div>
          <div className="mt-2 text-3xl font-bold text-warning-text">{pendingSent}</div>
          <div className="mt-1 text-xs text-muted">回答待ちの発注</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">進行中</div>
          <div className="mt-2 text-3xl font-bold text-accent">{activeCount}</div>
          <div className="mt-1 text-xs text-muted">受注・作業中</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">完了</div>
          <div className="mt-2 text-3xl font-bold text-success">{completedCount}</div>
          <div className="mt-1 text-xs text-muted">完了した取引</div>
        </div>
      </div>

      {/* New order form */}
      {showForm && (
        <section className="glass-card p-5">
          <h3 className="text-sm font-semibold text-primary mb-4">新規発注</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">発注元（自社店舗）</label>
                <input
                  type="text"
                  className="input-field bg-surface-hover"
                  value={myTenants[0]?.tenant_name ?? "読込中..."}
                  disabled
                />
                <p className="text-[10px] text-muted">※ 発注元は自動設定されます</p>
              </div>
              <div className="space-y-1 relative">
                <label className="text-xs text-muted">発注先 *</label>
                {selectedTenant ? (
                  <div className="flex items-center gap-2">
                    <div className="input-field bg-surface-hover flex-1 flex items-center justify-between">
                      <span>{selectedTenant.company_name}</span>
                      {selectedTenant.avg_rating && (
                        <span className="text-xs text-yellow-500">★ {selectedTenant.avg_rating}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-500 hover:underline"
                      onClick={() => { setSelectedTenant(null); setTenantQuery(""); }}
                    >
                      変更
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      className="input-field"
                      value={tenantQuery}
                      onChange={(e) => setTenantQuery(e.target.value)}
                      onFocus={() => tenantResults.length > 0 && setShowTenantDropdown(true)}
                      onBlur={() => setTimeout(() => setShowTenantDropdown(false), 200)}
                      placeholder="施工店名で検索..."
                    />
                    {searchingTenants && <p className="text-[10px] text-muted">検索中...</p>}
                    {showTenantDropdown && tenantResults.length > 0 && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {tenantResults.map((t) => (
                          <button
                            key={t.tenant_id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-surface-hover text-sm flex items-center justify-between"
                            onMouseDown={() => {
                              setSelectedTenant(t);
                              setTenantQuery("");
                              setShowTenantDropdown(false);
                            }}
                          >
                            <span className="font-medium">{t.company_name}</span>
                            <span className="text-xs text-muted">
                              {t.completed_orders > 0 && `${t.completed_orders}件完了`}
                              {t.avg_rating && ` ★${t.avg_rating}`}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showTenantDropdown && tenantResults.length === 0 && tenantQuery.length >= 1 && !searchingTenants && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface border border-border rounded-lg shadow-lg p-3 text-xs text-muted">
                        該当する施工店が見つかりません
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">カテゴリ</label>
                <select
                  className="select-field"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="">選択してください</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">件名 *</label>
              <input
                type="text"
                className="input-field"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例: PPF施工依頼（フロントバンパー）"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">詳細</label>
              <textarea
                className="input-field min-h-[80px]"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="施工内容の詳細を記入してください"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted">予算（円）</label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  placeholder="例: 50000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">納期</label>
                <input
                  type="date"
                  className="input-field"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" loading={submitting} disabled={submitting}>
                発注する
              </Button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                キャンセル
              </button>
            </div>
          </form>
        </section>
      )}

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {err && <div className="glass-card p-4 text-sm text-red-500">{err}</div>}

      {!loading && (
        <>
          {/* Filters */}
          <section className="glass-card p-5">
            <div className="flex gap-4 items-end flex-wrap">
              <div className="space-y-1">
                <label className="text-xs text-muted">種別</label>
                <select
                  className="select-field"
                  value={typeFilter}
                  onChange={(e) => applyFilters(e.target.value, undefined)}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted">ステータス</label>
                <select
                  className="select-field"
                  value={statusFilter}
                  onChange={(e) => applyFilters(undefined, e.target.value)}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Order list */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">受発注一覧</div>
                <div className="mt-1 text-base font-semibold text-primary">受発注一覧</div>
              </div>
              <div className="text-sm text-muted">{orders.length} 件</div>
            </div>

            {orders.length === 0 && (
              <div className="glass-card p-8 text-center text-muted">
                受発注データがありません。「新規発注」から他の施工店に仕事を依頼できます。
              </div>
            )}

            <div className="space-y-3">
              {orders.map((order) => (
                <Link key={order.id} href={`/admin/orders/${order.id}`} className="block">
                  <div className="glass-card p-4 space-y-3 hover:ring-1 hover:ring-accent/30 transition-shadow">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {order.order_number && (
                            <span className="text-xs text-muted font-mono">{order.order_number}</span>
                          )}
                          <span className="text-sm font-semibold text-primary truncate">{order.title}</span>
                        </div>
                        {order.category && (
                          <span className="text-xs text-secondary">{order.category}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant={statusVariant(order.status)}>
                          {statusLabel(order.status)}
                        </Badge>
                        <span className="text-xs text-muted">{formatDate(order.created_at)}</span>
                      </div>
                    </div>

                    {order.description && (
                      <p className="text-[13px] text-secondary line-clamp-2">{order.description}</p>
                    )}

                    <div className="flex items-center gap-6 text-xs text-muted">
                      {(order.accepted_amount || order.budget) && (
                        <span>
                          {order.accepted_amount ? "合意金額" : "予算"}:{" "}
                          <span className="font-semibold text-primary">
                            {formatJpy(order.accepted_amount ?? order.budget!)}
                          </span>
                        </span>
                      )}
                      {order.deadline && (
                        <span>納期: <span className="font-semibold text-primary">{formatDate(order.deadline)}</span></span>
                      )}
                      <span>発注先: <span className="text-secondary">{order.to_company || order.to_tenant_id?.slice(0, 8)}</span></span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
