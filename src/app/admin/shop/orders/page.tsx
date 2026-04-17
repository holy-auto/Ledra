"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import {
  type ShopOrderRow,
  type ShopOrderItemRow,
  SHOP_ORDER_STATUS_LABELS,
  SHOP_PAYMENT_METHOD_LABELS,
  type ShopOrderStatus,
} from "@/types/shopProduct";

const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

const STATUS_COLORS: Record<ShopOrderStatus, string> = {
  pending: "bg-warning-dim text-warning-text",
  paid: "bg-accent-dim text-accent-text",
  processing: "bg-violet-dim text-violet-text",
  shipped: "bg-accent-dim text-accent-text",
  completed: "bg-success-dim text-success-text",
  cancelled: "bg-surface-hover text-secondary",
};

type OrderWithItems = ShopOrderRow & { shop_order_items: ShopOrderItemRow[] };

export default function ShopOrdersPage() {
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shop/orders");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      setOrders(j.orders ?? []);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="space-y-6">
      <PageHeader
        tag="Shop"
        title="注文履歴"
        description="ショップでの注文一覧"
        actions={
          <Link
            href="/admin/shop"
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted transition-colors"
          >
            ショップに戻る
          </Link>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-primary/10 bg-surface p-4 space-y-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-3 w-48 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          <p className="text-lg mb-2">注文履歴がありません</p>
          <Link href="/admin/shop" className="text-sm text-link hover:underline">
            ショップで商品を選ぶ
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;
            return (
              <div
                key={order.id}
                className="rounded-xl border border-primary/10 bg-surface overflow-hidden"
              >
                {/* Order header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-semibold text-primary">{order.order_number}</p>
                      <p className="text-xs text-secondary">
                        {new Date(order.created_at).toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_COLORS[order.status]
                      }`}
                    >
                      {SHOP_ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <span className="text-xs text-secondary">
                      {SHOP_PAYMENT_METHOD_LABELS[order.payment_method]}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-primary">{fmt(order.total)}</span>
                    <svg
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      className={`text-secondary transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-primary/10 px-5 py-4 space-y-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-secondary border-b border-primary/10">
                          <th className="text-left pb-2 font-medium">商品</th>
                          <th className="text-right pb-2 font-medium">単価</th>
                          <th className="text-right pb-2 font-medium">数量</th>
                          <th className="text-right pb-2 font-medium">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.shop_order_items.map((item) => (
                          <tr key={item.id} className="border-b border-primary/5">
                            <td className="py-2 text-primary">{item.product_name}</td>
                            <td className="py-2 text-right text-secondary">{fmt(item.unit_price)}</td>
                            <td className="py-2 text-right text-secondary">{item.quantity}</td>
                            <td className="py-2 text-right font-medium text-primary">{fmt(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="text-xs text-secondary">
                          <td colSpan={3} className="pt-2 text-right">小計</td>
                          <td className="pt-2 text-right">{fmt(order.subtotal)}</td>
                        </tr>
                        <tr className="text-xs text-secondary">
                          <td colSpan={3} className="text-right">消費税</td>
                          <td className="text-right">{fmt(order.tax)}</td>
                        </tr>
                        <tr className="font-semibold text-primary">
                          <td colSpan={3} className="pt-1 text-right">合計</td>
                          <td className="pt-1 text-right">{fmt(order.total)}</td>
                        </tr>
                      </tfoot>
                    </table>

                    {order.note && (
                      <p className="text-xs text-secondary">
                        備考: {order.note}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
