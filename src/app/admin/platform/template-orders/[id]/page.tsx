"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import {
  ORDER_STATUS_LABELS,
  type TemplateOrderStatus,
  type TemplateOrderLogRow,
} from "@/types/templateOption";

type OrderDetail = {
  id: string;
  tenant_id: string;
  order_type: string;
  status: TemplateOrderStatus;
  hearing_json: Record<string, unknown> | null;
  notes: string | null;
  assigned_to: string | null;
  amount: number;
  revision_count: number;
  max_revisions: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  tenants: { name: string | null; slug: string | null } | null;
};

const STATUS_OPTIONS: TemplateOrderStatus[] = [
  "pending_payment", "paid", "hearing", "in_production",
  "review", "revision", "test_issued", "approved", "active", "cancelled",
];

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [logs, setLogs] = useState<TemplateOrderLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // オーダー一覧から該当オーダーを取得
      const res = await fetch("/api/admin/template-orders");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const found = j.orders?.find((o: any) => o.id === orderId);
      if (found) {
        setOrder(found);
        setNewStatus(found.status);
        setNewNotes(found.notes ?? "");
        setAssignedTo(found.assigned_to ?? "");
      }

      // ログ取得（管理者権限でservice roleを使うAPI経由）
      const logRes = await fetch(`/api/admin/template-orders?order_id=${orderId}&logs=true`);
      if (logRes.ok) {
        const logJ = await logRes.json();
        setLogs(logJ.logs ?? []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [orderId]);

  const handleUpdate = async () => {
    setUpdating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/template-orders", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          status: newStatus,
          notes: newNotes,
          assigned_to: assignedTo,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      setMessage({ type: "ok", text: "更新しました" });
      await fetchData();
    } catch (e: any) {
      setMessage({ type: "error", text: e?.message ?? String(e) });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="text-sm text-muted p-8">読み込み中...</div>;
  if (!order) return <div className="text-sm text-red-500 p-8">オーダーが見つかりません</div>;

  const hearing = order.hearing_json as Record<string, string> | null;

  return (
    <div className="space-y-6">
      <PageHeader
        tag="プラットフォーム管理"
        title={`オーダー詳細`}
        actions={
          <Link className="btn-ghost text-sm" href="/admin/platform/template-orders">
            一覧に戻る
          </Link>
        }
      />

      {message && (
        <div className={`glass-card p-3 text-sm ${message.type === "ok" ? "text-emerald-400" : "text-red-500"}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左：オーダー情報 */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">基本情報</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">テナント</span>
                <span className="text-primary font-semibold">{order.tenants?.name ?? order.tenant_id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">種別</span>
                <span className="text-primary">
                  {order.order_type === "custom_production" ? "オリジナル制作" :
                   order.order_type === "preset_setup" ? "テンプレ設定" :
                   order.order_type === "modification" ? "修正" : "追加"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">金額</span>
                <span className="text-primary">¥{order.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">修正回数</span>
                <span className="text-primary">{order.revision_count} / {order.max_revisions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">作成日</span>
                <span className="text-primary">{new Date(order.created_at).toLocaleString("ja-JP")}</span>
              </div>
              {order.completed_at && (
                <div className="flex justify-between">
                  <span className="text-muted">完了日</span>
                  <span className="text-primary">{new Date(order.completed_at).toLocaleString("ja-JP")}</span>
                </div>
              )}
            </div>
          </div>

          {/* ヒアリング内容 */}
          {hearing && Object.keys(hearing).length > 0 && (
            <div className="glass-card p-5 space-y-3">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">ヒアリング内容</div>
              <div className="space-y-2 text-sm">
                {Object.entries(hearing).map(([key, val]) => (
                  <div key={key}>
                    <div className="text-xs text-muted">{key}</div>
                    <div className="text-primary whitespace-pre-wrap">{String(val || "-")}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 右：ステータス更新 + タイムライン */}
        <div className="space-y-4">
          <div className="glass-card p-5 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">ステータス更新</div>
            <label className="block">
              <span className="text-xs text-muted">ステータス</span>
              <select
                className="input-field w-full mt-1"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted">担当者</span>
              <input
                type="text"
                className="input-field w-full mt-1"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="担当者名"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted">メモ</span>
              <textarea
                className="input-field w-full mt-1 min-h-[80px]"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="社内メモ"
              />
            </label>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={updating}
              onClick={handleUpdate}
            >
              {updating ? "更新中..." : "更新する"}
            </button>
          </div>

          {/* タイムライン */}
          <div className="glass-card p-5 space-y-3">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">対応履歴</div>
            {logs.length === 0 ? (
              <div className="text-xs text-muted">履歴はありません</div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                        log.action === "status_change" ? "bg-accent" :
                        log.action === "test_issue" ? "bg-violet-400" :
                        "bg-gray-400"
                      }`} />
                      <div className="w-px flex-1 bg-border-default" />
                    </div>
                    <div className="pb-3">
                      <div className="text-xs text-muted">
                        {new Date(log.created_at).toLocaleString("ja-JP")}
                        {log.actor && <span className="ml-2">{log.actor}</span>}
                      </div>
                      <div className="text-sm text-primary">
                        {log.from_status && log.to_status
                          ? `${ORDER_STATUS_LABELS[log.from_status as TemplateOrderStatus] ?? log.from_status} → ${ORDER_STATUS_LABELS[log.to_status as TemplateOrderStatus] ?? log.to_status}`
                          : log.action}
                      </div>
                      {log.message && (
                        <div className="text-xs text-muted mt-0.5">{log.message}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
