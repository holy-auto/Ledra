"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import {
  ORDER_STATUS_LABELS,
  OPTION_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  type TemplateOrderStatus,
} from "@/types/templateOption";

type OrderWithTenant = {
  id: string;
  tenant_id: string;
  order_type: string;
  status: TemplateOrderStatus;
  amount: number;
  revision_count: number;
  max_revisions: number;
  assigned_to: string | null;
  notes: string | null;
  due_date: string | null;
  created_at: string;
  tenants: { name: string | null; slug: string | null } | null;
};

type SubWithTenant = {
  id: string;
  tenant_id: string;
  option_type: string;
  status: string;
  started_at: string;
  current_period_end: string | null;
  tenants: { name: string | null; slug: string | null } | null;
};

const STATUS_OPTIONS: TemplateOrderStatus[] = [
  "pending_payment", "paid", "hearing", "in_production",
  "review", "revision", "test_issued", "approved", "active", "cancelled",
];

export default function PlatformTemplateOrdersPage() {
  const [orders, setOrders] = useState<OrderWithTenant[]>([]);
  const [subs, setSubs] = useState<SubWithTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/template-orders");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setOrders(j.orders ?? []);
      setSubs(j.subscriptions ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(orderId);
    try {
      const res = await fetch("/api/admin/template-orders", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchData();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader tag="プラットフォーム管理" title="テンプレートオーダー管理" />

      {loading && <div className="text-sm text-muted">読み込み中...</div>}
      {error && <div className="glass-card p-4 text-sm text-red-500">{error}</div>}

      {/* サブスクリプション一覧 */}
      {!loading && subs.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">オプション契約一覧</div>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">テナント</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">プラン</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">開始日</th>
                <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">次回請求</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((sub) => (
                <tr key={sub.id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                  <td className="p-3 text-primary font-semibold">
                    {sub.tenants?.name ?? sub.tenants?.slug ?? sub.tenant_id.slice(0, 8)}
                  </td>
                  <td className="p-3 text-primary">
                    {OPTION_TYPE_LABELS[sub.option_type as keyof typeof OPTION_TYPE_LABELS] ?? sub.option_type}
                  </td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      sub.status === "active" ? "bg-emerald-900/30 text-emerald-400" :
                      sub.status === "cancelled" ? "bg-red-900/30 text-red-400" :
                      "bg-amber-900/30 text-amber-400"
                    }`}>
                      {SUBSCRIPTION_STATUS_LABELS[sub.status as keyof typeof SUBSCRIPTION_STATUS_LABELS] ?? sub.status}
                    </span>
                  </td>
                  <td className="p-3 text-primary whitespace-nowrap">
                    {new Date(sub.started_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="p-3 text-primary whitespace-nowrap">
                    {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("ja-JP") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* オーダー一覧 */}
      {!loading && (
        <div className="glass-card overflow-hidden">
          <div className="p-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">制作オーダー一覧</div>
          </div>
          {orders.length === 0 ? (
            <div className="p-6 text-sm text-muted">オーダーはありません</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">テナント</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">種別</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">金額</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">修正</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">担当</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">作成日</th>
                  <th className="text-left p-3 text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-border-default hover:bg-surface-hover transition-colors">
                    <td className="p-3 text-primary font-semibold">
                      {order.tenants?.name ?? order.tenants?.slug ?? order.tenant_id.slice(0, 8)}
                    </td>
                    <td className="p-3 text-primary text-xs">
                      {order.order_type === "custom_production" ? "オリジナル制作" :
                       order.order_type === "preset_setup" ? "テンプレ設定" :
                       order.order_type === "modification" ? "修正" : "追加"}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                        order.status === "active" ? "bg-emerald-900/30 text-emerald-400" :
                        order.status === "cancelled" ? "bg-red-900/30 text-red-400" :
                        "bg-[#0071e3]/20 text-[#0071e3]"
                      }`}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="p-3 text-primary">¥{order.amount.toLocaleString()}</td>
                    <td className="p-3 text-primary">{order.revision_count}/{order.max_revisions}</td>
                    <td className="p-3 text-primary text-xs">{order.assigned_to ?? "-"}</td>
                    <td className="p-3 text-primary whitespace-nowrap text-xs">
                      {new Date(order.created_at).toLocaleDateString("ja-JP")}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <select
                          className="input-field text-xs py-1"
                          value={order.status}
                          disabled={updating === order.id}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {ORDER_STATUS_LABELS[s]}
                            </option>
                          ))}
                        </select>
                        <Link
                          href={`/admin/platform/template-orders/${order.id}`}
                          className="text-[#0071e3] text-xs underline whitespace-nowrap"
                        >
                          詳細
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
