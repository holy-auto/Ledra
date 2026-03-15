"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { formatJpy, formatDate } from "@/lib/format";

type OrderStatus = "pending" | "accepted" | "in_progress" | "completed" | "rejected" | "cancelled";

interface OrderRow {
  id: string;
  from_tenant_id: string;
  to_tenant_id: string;
  from_company?: string;
  to_company?: string;
  title: string;
  description: string | null;
  category: string | null;
  budget: number | null;
  deadline: string | null;
  status: OrderStatus;
  created_at: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "pending", label: "申請中" },
  { value: "accepted", label: "受注" },
  { value: "in_progress", label: "作業中" },
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
    accepted: "受注",
    in_progress: "作業中",
    completed: "完了",
    rejected: "辞退",
    cancelled: "キャンセル",
  };
  return m[s] ?? s;
};

const statusVariant = (s: OrderStatus): "default" | "success" | "warning" | "danger" | "info" => {
  const m: Record<OrderStatus, "default" | "success" | "warning" | "danger" | "info"> = {
    pending: "warning",
    accepted: "info",
    in_progress: "info",
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

const NEXT_STATUS_RECEIVED: Record<string, string | null> = {
  pending: "accepted",
  accepted: "in_progress",
  in_progress: "completed",
  completed: null,
  rejected: null,
  cancelled: null,
};

export default function OrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // New order form
  const [formData, setFormData] = useState({
    to_tenant_id: "",
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
      await fetchOrders();
      setLoading(false);
    })();
  }, [fetchOrders]);

  const applyFilters = (newType?: string, newStatus?: string) => {
    const t = newType ?? typeFilter;
    const s = newStatus ?? statusFilter;
    if (newType !== undefined) setTypeFilter(t);
    if (newStatus !== undefined) setStatusFilter(s);
    fetchOrders(t, s);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.to_tenant_id || !formData.title) {
      alert("送信先テナントIDと件名は必須です");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          budget: formData.budget ? Number(formData.budget) : null,
          deadline: formData.deadline || null,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setShowForm(false);
      setFormData({ to_tenant_id: "", title: "", description: "", category: "", budget: "", deadline: "" });
      await fetchOrders(typeFilter, statusFilter);
    } catch (e: unknown) {
      alert("発注に失敗しました: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: newStatus }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      await fetchOrders(typeFilter, statusFilter);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUpdatingId(null);
    }
  };

  const pendingSent = orders.filter((o) => o.status === "pending").length;
  const activeCount = orders.filter((o) => o.status === "accepted" || o.status === "in_progress").length;
  const completedCount = orders.filter((o) => o.status === "completed").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="JOB ORDERS"
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
          <div className="mt-2 text-3xl font-bold text-[#b35c00]">{pendingSent}</div>
          <div className="mt-1 text-xs text-muted">回答待ちの発注</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">進行中</div>
          <div className="mt-2 text-3xl font-bold text-[#0071e3]">{activeCount}</div>
          <div className="mt-1 text-xs text-muted">受注・作業中</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">完了</div>
          <div className="mt-2 text-3xl font-bold text-[#28a745]">{completedCount}</div>
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
                <label className="text-xs text-muted">発注先テナントID *</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.to_tenant_id}
                  onChange={(e) => setFormData({ ...formData, to_tenant_id: e.target.value })}
                  placeholder="発注先のテナントID"
                  required
                />
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
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? "送信中..." : "発注する"}
              </button>
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
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">ORDER LIST</div>
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
                <div key={order.id} className="glass-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary truncate">{order.title}</div>
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
                    <p className="text-[13px] text-secondary">{order.description}</p>
                  )}

                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex gap-6 text-xs text-muted">
                      {order.budget && (
                        <span>予算: <span className="font-semibold text-primary">{formatJpy(order.budget)}</span></span>
                      )}
                      {order.deadline && (
                        <span>納期: <span className="font-semibold text-primary">{formatDate(order.deadline)}</span></span>
                      )}
                      <span>発注先: <span className="text-secondary">{order.to_company || order.to_tenant_id?.slice(0, 8)}</span></span>
                    </div>

                    {/* Status action buttons (received orders only) */}
                    {(() => {
                      const nextStatus = NEXT_STATUS_RECEIVED[order.status];
                      const isUpdating = updatingId === order.id;
                      if (!nextStatus && order.status !== "pending") return null;
                      return (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {nextStatus && (
                            <button
                              onClick={() => handleStatusUpdate(order.id, nextStatus)}
                              disabled={isUpdating}
                              className="btn-primary px-2.5 py-1 text-[11px]"
                            >
                              {isUpdating ? "..." : `${statusLabel(nextStatus as OrderStatus)}へ`}
                            </button>
                          )}
                          {order.status === "pending" && (
                            <button
                              onClick={() => handleStatusUpdate(order.id, "rejected")}
                              disabled={isUpdating}
                              className="btn-secondary px-2.5 py-1 text-[11px] text-red-500"
                            >
                              辞退
                            </button>
                          )}
                          {(order.status === "pending" || order.status === "accepted") && (
                            <button
                              onClick={() => handleStatusUpdate(order.id, "cancelled")}
                              disabled={isUpdating}
                              className="btn-secondary px-2.5 py-1 text-[11px] text-red-500"
                            >
                              取消
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
