"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ShopOrderRow,
  type ShopOrderItemRow,
  type ShopOrderStatus,
  SHOP_ORDER_STATUS_LABELS,
  SHOP_PAYMENT_METHOD_LABELS,
} from "@/types/shopProduct";

const fmt = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

// 運営が手動で設定できるステータス（API 側の MANAGEABLE_STATUSES と一致）。
const MANAGEABLE_STATUSES: ShopOrderStatus[] = ["pending", "paid", "processing", "shipped", "completed", "cancelled"];

// 「要対応」= 運営の出荷・請求アクション待ち。発送済み/完了/キャンセル/決済失敗は除く。
const ACTION_NEEDED: ShopOrderStatus[] = ["pending", "paid", "processing"];

// 出力できる帳票の種類とラベル（API の type と一致）。
type ShopDocType = "invoice" | "delivery" | "receipt";
const DOC_LABELS: Record<ShopDocType, string> = {
  invoice: "請求書",
  delivery: "納品書",
  receipt: "領収書",
};
// 領収書は入金確認済みの注文に対してのみ発行する。
const RECEIPT_ALLOWED: ShopOrderStatus[] = ["paid", "processing", "shipped", "completed"];

const STATUS_COLORS: Record<ShopOrderStatus, string> = {
  pending: "bg-warning-dim text-warning-text",
  pending_checkout: "bg-warning-dim text-warning-text",
  pending_payment: "bg-warning-dim text-warning-text",
  checkout_failed: "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  paid: "bg-accent-dim text-accent-text",
  processing: "bg-violet-dim text-violet-text",
  shipped: "bg-accent-dim text-accent-text",
  completed: "bg-success-dim text-success-text",
  cancelled: "bg-surface-hover text-secondary",
};

type OrderRow = ShopOrderRow & {
  tenants: { name: string | null; slug: string | null } | null;
  shop_order_items: ShopOrderItemRow[];
};

type FilterKey = "all" | "action" | "shipped" | "completed";

export default function PlatformShopOrdersClient() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform/shop-orders");
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

  const updateStatus = useCallback(async (orderId: string, status: ShopOrderStatus) => {
    setUpdating(orderId);
    setError(null);
    try {
      const res = await fetch("/api/admin/platform/shop-orders", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      }
      // 楽観的に手元の行を更新（再取得は明細展開を畳んでしまうため避ける）。
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setUpdating(null);
    }
  }, []);

  // 帳票 PDF / CSV のダウンロード中フラグ。
  const [docBusy, setDocBusy] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // Blob を取得してブラウザのダウンロードを発火する共通処理。
  const downloadBlob = useCallback(async (url: string, fallbackName: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = fallbackName;
    a.click();
    URL.revokeObjectURL(objUrl);
  }, []);

  const downloadDocument = useCallback(
    async (orderId: string, type: ShopDocType, orderNumber: string) => {
      const key = `${orderId}:${type}`;
      setDocBusy(key);
      setError(null);
      try {
        await downloadBlob(
          `/api/admin/platform/shop-orders/${orderId}/document?type=${type}`,
          `${DOC_LABELS[type]}_${orderNumber}.pdf`,
        );
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setDocBusy(null);
      }
    },
    [downloadBlob],
  );

  const exportCsv = useCallback(async () => {
    setCsvBusy(true);
    setError(null);
    try {
      await downloadBlob(
        "/api/admin/platform/shop-orders/export",
        `shop_orders_${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCsvBusy(false);
    }
  }, [downloadBlob]);

  const actionNeededCount = useMemo(() => orders.filter((o) => ACTION_NEEDED.includes(o.status)).length, [orders]);

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case "action":
        return orders.filter((o) => ACTION_NEEDED.includes(o.status));
      case "shipped":
        return orders.filter((o) => o.status === "shipped");
      case "completed":
        return orders.filter((o) => o.status === "completed");
      default:
        return orders;
    }
  }, [orders, filter]);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "action", label: `要対応${actionNeededCount > 0 ? `（${actionNeededCount}）` : ""}` },
    { key: "shipped", label: "発送済み" },
    { key: "completed", label: "完了" },
  ];

  return (
    <div className="space-y-4">
      {/* 要対応サマリー */}
      <div className="rounded-xl border border-primary/10 bg-surface p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-secondary">要対応の注文（未発送）</p>
          <p className="text-2xl font-bold text-primary">{actionNeededCount}件</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={csvBusy || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted transition-colors disabled:opacity-50"
          >
            {csvBusy ? "出力中…" : "CSV出力"}
          </button>
          <button
            onClick={fetchOrders}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-surface px-3 py-1.5 text-sm font-medium text-primary hover:bg-muted transition-colors disabled:opacity-50"
          >
            再読み込み
          </button>
        </div>
      </div>

      {/* フィルタ */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === f.key ? "bg-primary text-on-primary" : "bg-muted text-secondary hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20 p-4 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-xl border border-primary/10 bg-surface p-4 space-y-2">
              <div className="h-4 w-40 rounded bg-muted" />
              <div className="h-3 w-56 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-16 text-secondary">
          <p className="text-lg">該当する注文がありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const isExpanded = expandedId === order.id;
            const tenantLabel = order.tenants?.name ?? order.tenants?.slug ?? order.tenant_id.slice(0, 8);
            // 現在のステータスが手動設定の対象外（Stripe ライフサイクル中間状態）でも
            // <select> の controlled value を有効に保つため候補へ含める。
            const statusOptions = MANAGEABLE_STATUSES.includes(order.status)
              ? MANAGEABLE_STATUSES
              : [order.status, ...MANAGEABLE_STATUSES];
            return (
              <div key={order.id} className="rounded-xl border border-primary/10 bg-surface overflow-hidden">
                <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                    className="flex items-center gap-4 text-left"
                  >
                    <div>
                      <p className="text-sm font-semibold text-primary">{tenantLabel}</p>
                      <p className="text-xs text-secondary">
                        {order.order_number} ·{" "}
                        {new Date(order.created_at).toLocaleDateString("ja-JP", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-xs text-secondary">{SHOP_PAYMENT_METHOD_LABELS[order.payment_method]}</span>
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
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-primary">{fmt(order.total)}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}
                    >
                      {SHOP_ORDER_STATUS_LABELS[order.status]}
                    </span>
                    <select
                      value={order.status}
                      disabled={updating === order.id}
                      onChange={(e) => updateStatus(order.id, e.target.value as ShopOrderStatus)}
                      className="rounded-lg border border-primary/20 bg-surface px-2 py-1 text-xs text-primary disabled:opacity-50"
                      aria-label="ステータスを変更"
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {SHOP_ORDER_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

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
                          <td colSpan={3} className="pt-2 text-right">
                            小計
                          </td>
                          <td className="pt-2 text-right">{fmt(order.subtotal)}</td>
                        </tr>
                        <tr className="text-xs text-secondary">
                          <td colSpan={3} className="text-right">
                            消費税
                          </td>
                          <td className="text-right">{fmt(order.tax)}</td>
                        </tr>
                        <tr className="font-semibold text-primary">
                          <td colSpan={3} className="pt-1 text-right">
                            合計
                          </td>
                          <td className="pt-1 text-right">{fmt(order.total)}</td>
                        </tr>
                      </tfoot>
                    </table>

                    {order.note && <p className="text-xs text-secondary">備考: {order.note}</p>}

                    {/* 帳票出力（請求書・納品書・領収書） */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-primary/10 pt-3">
                      <span className="text-xs font-medium text-secondary">帳票出力:</span>
                      {(Object.keys(DOC_LABELS) as ShopDocType[]).map((type) => {
                        const key = `${order.id}:${type}`;
                        const busy = docBusy === key;
                        const disabled = busy || (type === "receipt" && !RECEIPT_ALLOWED.includes(order.status));
                        const title =
                          type === "receipt" && !RECEIPT_ALLOWED.includes(order.status)
                            ? "入金確認後に発行できます"
                            : `${DOC_LABELS[type]}をPDFでダウンロード`;
                        return (
                          <button
                            key={type}
                            onClick={() => downloadDocument(order.id, type, order.order_number)}
                            disabled={disabled}
                            title={title}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary/20 bg-surface px-2.5 py-1 text-xs font-medium text-primary hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg
                              width="13"
                              height="13"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.8}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                              />
                            </svg>
                            {busy ? "生成中…" : `${DOC_LABELS[type]}PDF`}
                          </button>
                        );
                      })}
                    </div>
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
