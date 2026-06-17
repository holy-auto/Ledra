"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import { fetcher } from "@/lib/swr";
import { formatDate } from "@/lib/format";
import {
  SUPPLY_PARTNER_RESPONSE_LABELS,
  SUPPLY_DECLINE_REASON_LABELS,
  type SupplyPartnerResponse,
  type SupplyDeclineReason,
} from "@/types/supply";
import AutoSendSettings from "./AutoSendSettings";

/* ---------- Types ---------- */

type POItem = {
  id: string;
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number | null;
  amount: number;
  received: boolean;
  accepted_quantity: number | null;
  backorder_quantity: number | null;
};

type PurchaseOrder = {
  id: string;
  supplier_id: string | null;
  supply_partner_id: string | null;
  po_number: string | null;
  status: "draft" | "approved" | "sent" | "received" | "cancelled";
  source: "auto" | "manual";
  note: string | null;
  subtotal: number;
  transport: string | null;
  transport_status: string | null;
  partner_response: SupplyPartnerResponse | null;
  partner_responded_at: string | null;
  partner_ship_eta: string | null;
  partner_tracking_no: string | null;
  decline_reason: SupplyDeclineReason | null;
  created_at: string;
  suppliers?: { name: string } | null;
  purchase_order_items?: POItem[];
};

const PARTNER_RESPONSE_CLASS: Record<SupplyPartnerResponse, string> = {
  pending: "bg-amber-500/10 text-amber-500",
  accepted: "bg-emerald-500/10 text-emerald-500",
  partial: "bg-orange-500/10 text-orange-500",
  declined: "bg-red-500/10 text-red-400",
};

type POResponse = { ok: boolean; purchase_orders: PurchaseOrder[] };

const STATUS_LABELS: Record<PurchaseOrder["status"], string> = {
  draft: "下書き",
  approved: "承認済み",
  sent: "発注済み",
  received: "入荷済み",
  cancelled: "取消",
};

const STATUS_CLASS: Record<PurchaseOrder["status"], string> = {
  draft: "bg-surface-hover text-secondary",
  approved: "bg-amber-500/10 text-amber-500",
  sent: "bg-blue-500/10 text-blue-500",
  received: "bg-emerald-500/10 text-emerald-500",
  cancelled: "bg-red-500/10 text-red-400",
};

// 許可するステータス遷移 (サーバの ALLOWED_TRANSITIONS と一致させる)。
const TRANSITIONS: Record<
  PurchaseOrder["status"],
  Array<{ to: PurchaseOrder["status"]; label: string; primary?: boolean }>
> = {
  draft: [
    { to: "approved", label: "承認", primary: true },
    { to: "sent", label: "発注" },
    { to: "cancelled", label: "取消" },
  ],
  approved: [
    { to: "sent", label: "発注", primary: true },
    { to: "cancelled", label: "取消" },
  ],
  sent: [
    { to: "received", label: "入荷", primary: true },
    { to: "cancelled", label: "取消" },
  ],
  received: [],
  cancelled: [],
};

const FILTERS: Array<{ key: string; label: string }> = [
  { key: "", label: "すべて" },
  { key: "draft", label: "下書き" },
  { key: "approved", label: "承認済み" },
  { key: "sent", label: "発注済み" },
  { key: "received", label: "入荷済み" },
];

/* ---------- Component ---------- */

export default function PurchaseOrdersClient() {
  const [statusFilter, setStatusFilter] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiPo, setAiPo] = useState<PurchaseOrder | null>(null);

  const swrKey = useMemo(
    () => `/api/admin/purchase-orders${statusFilter ? `?status=${statusFilter}` : ""}`,
    [statusFilter],
  );
  const { data, mutate } = useSWR<POResponse>(swrKey, fetcher);
  const orders = data?.purchase_orders ?? [];

  const supplierLabel = (po: PurchaseOrder): string => {
    if (po.suppliers?.name) return po.suppliers.name;
    if (po.supply_partner_id) return "供給パートナー";
    return "—";
  };

  const hasBackorder = (po: PurchaseOrder): boolean =>
    po.partner_response === "partial" &&
    (po.purchase_order_items ?? []).some((it) => it.backorder_quantity != null && Number(it.backorder_quantity) > 0);

  const reorderBackorder = async (po: PurchaseOrder) => {
    if (!confirm("欠品分を新しい発注ドラフトとして作成します。よろしいですか？")) return;
    setBusyId(po.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/purchase-orders/${po.id}/backorder`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "再発注ドラフトの作成に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: "欠品分の発注ドラフトを作成しました（仕入先を選んで送信してください）。" });
      await mutate();
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setBusyId(null);
    }
  };

  const transition = async (po: PurchaseOrder, to: PurchaseOrder["status"]) => {
    if (to === "sent" && !confirm(`発注「${po.po_number ?? ""}」を送信扱いにします。よろしいですか？`)) return;
    if (to === "cancelled" && !confirm("この発注を取消します。よろしいですか？")) return;
    setBusyId(po.id);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/purchase-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: po.id, status: to }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        setMsg({ ok: false, text: j?.message ?? "更新に失敗しました。" });
        return;
      }
      setMsg({ ok: true, text: `「${STATUS_LABELS[to]}」に更新しました。` });
      await mutate();
    } catch {
      setMsg({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        tag="PURCHASE ORDERS"
        title="発注管理"
        description="在庫下限割れで自動起票された発注を確認し、承認・発注・入荷を記録します。送信前に AI が発注文面の下書きを作れます。"
      />

      {msg && <div className={`text-sm ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</div>}

      <AutoSendSettings />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              statusFilter === f.key ? "bg-accent text-white" : "bg-surface-hover text-secondary hover:text-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {orders.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted">該当する発注はありません。</div>
      ) : (
        <div className="space-y-4">
          {orders.map((po) => (
            <div key={po.id} className="glass-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[po.status]}`}>
                      {STATUS_LABELS[po.status]}
                    </span>
                    <span className="font-mono text-sm text-secondary">{po.po_number ?? po.id.slice(0, 8)}</span>
                    {po.source === "auto" && (
                      <span className="rounded bg-accent-dim px-1.5 py-0.5 text-[10px] text-accent">自動</span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    仕入先: {supplierLabel(po)} ・ {formatDate(po.created_at)}
                  </div>
                  {po.transport === "portal" && po.partner_response && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="text-muted">メーカー回答:</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${PARTNER_RESPONSE_CLASS[po.partner_response]}`}
                      >
                        {SUPPLY_PARTNER_RESPONSE_LABELS[po.partner_response]}
                      </span>
                      {po.partner_ship_eta && <span className="text-secondary">出荷予定 {po.partner_ship_eta}</span>}
                      {po.partner_tracking_no && <span className="text-secondary">追跡 {po.partner_tracking_no}</span>}
                      {po.partner_response === "declined" && po.decline_reason && (
                        <span className="text-red-400">理由: {SUPPLY_DECLINE_REASON_LABELS[po.decline_reason]}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary">¥{Number(po.subtotal).toLocaleString("ja-JP")}</div>
                  <div className="text-xs text-muted">概算合計</div>
                </div>
              </div>

              {/* Items */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">品目</th>
                      <th className="px-4 py-2 font-medium">品番</th>
                      <th className="px-4 py-2 font-medium text-right">数量</th>
                      <th className="px-4 py-2 font-medium text-right">単価</th>
                      <th className="px-4 py-2 font-medium text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(po.purchase_order_items ?? []).map((it) => (
                      <tr key={it.id} className="border-t border-border-subtle/40">
                        <td className="px-4 py-2 text-primary">{it.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted">{it.sku ?? "—"}</td>
                        <td className="px-4 py-2 text-right text-secondary">
                          {Number(it.quantity)}
                          {it.backorder_quantity != null && Number(it.backorder_quantity) > 0 && (
                            <span className="ml-1 text-[10px] text-orange-500">
                              （受注 {Number(it.accepted_quantity ?? 0)} / 欠品 {Number(it.backorder_quantity)}）
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right text-secondary">
                          {it.unit_cost != null ? `¥${Number(it.unit_cost).toLocaleString("ja-JP")}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-right text-secondary">
                          {it.amount ? `¥${Number(it.amount).toLocaleString("ja-JP")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle p-4">
                {(po.status === "draft" || po.status === "approved" || po.status === "sent") && (
                  <button
                    type="button"
                    onClick={() => setAiPo(po)}
                    className="btn-ghost text-xs"
                    disabled={busyId === po.id}
                  >
                    ✨ AI下書き
                  </button>
                )}
                {hasBackorder(po) && (
                  <button
                    type="button"
                    onClick={() => reorderBackorder(po)}
                    className="btn-ghost text-xs text-orange-500"
                    disabled={busyId === po.id}
                  >
                    欠品分を再発注
                  </button>
                )}
                <div className="flex-1" />
                {TRANSITIONS[po.status].map((t) => (
                  <button
                    key={t.to}
                    type="button"
                    disabled={busyId === po.id}
                    onClick={() => transition(po, t.to)}
                    className={t.primary ? "btn-primary text-xs" : "btn-ghost text-xs"}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {aiPo && (
        <AiDraftModal
          po={aiPo}
          onClose={() => setAiPo(null)}
          onSent={async (m) => {
            setMsg(m);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

/* ---------- AI draft modal ---------- */

function AiDraftModal({
  po,
  onClose,
  onSent,
}: {
  po: PurchaseOrder;
  onClose: () => void;
  onSent: (msg: { ok: boolean; text: string }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [aiUsed, setAiUsed] = useState(false);
  const [sending, setSending] = useState(false);
  // この文面で発注できるのは下書き/承認済みのみ (送信済みは再送しない)。
  const canSend = po.status === "draft" || po.status === "approved";
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/purchase-orders/ai-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ po_id: po.id }),
        });
        const j = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !j?.message) {
          setErr(j?.message ?? "下書きの生成に失敗しました。");
          return;
        }
        setSubject(j.message.subject ?? "");
        setBody(j.message.body ?? "");
        setAiUsed(Boolean(j.ai_used));
      } catch {
        if (!cancelled) setErr("通信エラーが発生しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [po.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`件名: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  // この文面で発注 = sent へ遷移 + レビュー済み文面をメール本文に渡す (壁3: 人の操作)。
  const sendWithMessage = async () => {
    if (!confirm(`発注「${po.po_number ?? ""}」をこの文面で送信します。よろしいですか？`)) return;
    setSending(true);
    try {
      const res = await fetch("/api/admin/purchase-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: po.id, status: "sent", message: { subject, body } }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) {
        onSent({ ok: false, text: j?.message ?? "発注の送信に失敗しました。" });
        return;
      }
      const how =
        j.transport === "api"
          ? "API 発注"
          : j.transport === "portal"
            ? "ポータル投函"
            : j.emailed
              ? "メール送信"
              : "記録のみ (送信先未設定)";
      onSent({ ok: true, text: `発注を送信しました（${how}）。` });
      onClose();
    } catch {
      onSent({ ok: false, text: "通信エラーが発生しました。" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-border-subtle bg-surface p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-primary">発注メールの下書き</h2>
            <p className="text-xs text-muted">
              {po.po_number} ・ {aiUsed ? "AI 生成" : "定型文"}（送信前にご確認・編集できます）
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-muted">生成中...</div>
        ) : err ? (
          <div className="py-6 text-center text-sm text-red-500">{err}</div>
        ) : (
          <>
            <label className="block">
              <div className="text-xs text-muted mb-1">件名</div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-field w-full" />
            </label>
            <label className="block">
              <div className="text-xs text-muted mb-1">本文</div>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="input-field w-full font-mono text-xs leading-relaxed"
              />
            </label>
            <p className="text-xs text-muted">
              ※ 数量・金額は発注内容のまま固定されています。送信（実際の発注確定）は別操作です。
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={onClose} className="btn-ghost text-sm">
                閉じる
              </button>
              <button type="button" onClick={copy} className="btn-ghost text-sm">
                {copied ? "コピーしました" : "コピー"}
              </button>
              {canSend && (
                <button
                  type="button"
                  onClick={sendWithMessage}
                  disabled={sending || !body.trim()}
                  className="btn-primary text-sm"
                >
                  {sending ? "送信中..." : "この文面で発注"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
