"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import { formatDateTime, formatJpy } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

/* ── Types ── */
type Invoice = {
  id: string;
  agent_id: string;
  agent_name: string;
  invoice_number: string | null;
  period_start: string | null;
  period_end: string | null;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  status: string;
  issued_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

/* ── Status map ── */
const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "下書き", variant: "default" },
  issued: { label: "発行済", variant: "info" },
  paid: { label: "支払済", variant: "success" },
  cancelled: { label: "キャンセル", variant: "danger" },
};

function statusEntry(s: string) {
  return STATUS_MAP[s] ?? { label: s, variant: "default" as BadgeVariant };
}

export default function AdminInvoicesClient() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  /* form state */
  const [formAgentId, setFormAgentId] = useState("");
  const [formPeriodStart, setFormPeriodStart] = useState("");
  const [formPeriodEnd, setFormPeriodEnd] = useState("");
  const [formSubtotal, setFormSubtotal] = useState("");
  const [formTaxRate, setFormTaxRate] = useState("10");
  const [formNotes, setFormNotes] = useState("");

  /* ── Fetch ── */
  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agent-invoices", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setInvoices(json.invoices ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  /* ── Create ── */
  const handleCreate = async () => {
    if (!formAgentId || !formPeriodStart || !formPeriodEnd) {
      setMsg("代理店ID・期間は必須です");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/agent-invoices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent_id: formAgentId,
          period_start: formPeriodStart,
          period_end: formPeriodEnd,
          subtotal: parseFloat(formSubtotal) || 0,
          tax_rate: parseFloat(formTaxRate) || 10,
          notes: formNotes || null,
        }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg("請求書を作成しました");
      setShowForm(false);
      resetForm();
      fetchInvoices();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setFormAgentId("");
    setFormPeriodStart("");
    setFormPeriodEnd("");
    setFormSubtotal("");
    setFormTaxRate("10");
    setFormNotes("");
  };

  /* ── Status change ── */
  const changeStatus = async (id: string, newStatus: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/agent-invoices/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const j = await parseJsonSafe(res);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setMsg(`ステータスを「${statusEntry(newStatus).label}」に変更しました`);
      fetchInvoices();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /* ── Next allowed statuses ── */
  const nextStatuses = (current: string): string[] => {
    switch (current) {
      case "draft":
        return ["issued", "cancelled"];
      case "issued":
        return ["paid", "cancelled"];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      {/* Actions bar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <span className="text-sm text-muted">{invoices.length} 件</span>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary">
          {showForm ? "閉じる" : "新規作成"}
        </button>
      </div>

      {/* Message */}
      {msg && <div className="rounded-xl border border-default bg-surface-solid p-3 text-sm text-secondary">{msg}</div>}

      {/* Create form */}
      {showForm && (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm p-6 space-y-4">
          <h3 className="text-base font-semibold text-primary">請求書を作成</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm text-secondary mb-1 block">代理店ID *</label>
              <input
                type="text"
                value={formAgentId}
                onChange={(e) => setFormAgentId(e.target.value)}
                className="input-field w-full"
                placeholder="UUID"
              />
            </div>
            <div />
            <div>
              <label className="text-sm text-secondary mb-1 block">期間開始 *</label>
              <input
                type="date"
                value={formPeriodStart}
                onChange={(e) => setFormPeriodStart(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">期間終了 *</label>
              <input
                type="date"
                value={formPeriodEnd}
                onChange={(e) => setFormPeriodEnd(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">小計（税抜）</label>
              <input
                type="number"
                min="0"
                value={formSubtotal}
                onChange={(e) => setFormSubtotal(e.target.value)}
                className="input-field w-full"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm text-secondary mb-1 block">税率（%）</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={formTaxRate}
                onChange={(e) => setFormTaxRate(e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-sm text-secondary mb-1 block">備考</label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={3}
              className="input-field w-full"
              placeholder="任意メモ"
            />
          </div>

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="rounded-xl border border-default bg-surface-solid px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-hover"
            >
              キャンセル
            </button>
            <button onClick={handleCreate} disabled={busy} className="btn-primary">
              {busy ? "作成中..." : "作成"}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-border-subtle dark:bg-[rgba(255,255,255,0.06)]" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm p-8 text-center text-muted">
          請求書がまだありません
        </div>
      ) : (
        <div className="rounded-2xl border border-default bg-surface-solid shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-inset)]">
                <tr>
                  <th className="p-3 text-left font-semibold text-secondary">代理店</th>
                  <th className="p-3 text-left font-semibold text-secondary">請求番号</th>
                  <th className="p-3 text-left font-semibold text-secondary">期間</th>
                  <th className="p-3 text-right font-semibold text-secondary">小計</th>
                  <th className="p-3 text-right font-semibold text-secondary">税額</th>
                  <th className="p-3 text-right font-semibold text-secondary">合計</th>
                  <th className="p-3 text-left font-semibold text-secondary">ステータス</th>
                  <th className="p-3 text-left font-semibold text-secondary">作成日</th>
                  <th className="p-3 text-left font-semibold text-secondary">操作</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const s = statusEntry(inv.status);
                  const allowed = nextStatuses(inv.status);
                  return (
                    <tr
                      key={inv.id}
                      className="border-t border-[var(--border-subtle)] hover:bg-[var(--bg-surface-hover)]"
                    >
                      <td className="p-3 font-medium text-primary">{inv.agent_name || inv.agent_id}</td>
                      <td className="p-3 font-mono text-muted">{inv.invoice_number || "-"}</td>
                      <td className="p-3 whitespace-nowrap text-muted">
                        {inv.period_start ?? "-"} ~ {inv.period_end ?? "-"}
                      </td>
                      <td className="p-3 text-right font-mono text-primary">{formatJpy(inv.subtotal)}</td>
                      <td className="p-3 text-right font-mono text-muted">{formatJpy(inv.tax_amount)}</td>
                      <td className="p-3 text-right font-mono font-semibold text-primary">{formatJpy(inv.total)}</td>
                      <td className="p-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="p-3 whitespace-nowrap text-muted">{formatDateTime(inv.created_at)}</td>
                      <td className="p-3">
                        {allowed.length > 0 && (
                          <select
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => {
                              if (e.target.value) changeStatus(inv.id, e.target.value);
                              e.target.value = "";
                            }}
                            className="rounded-xl border border-default bg-surface-solid px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
                          >
                            <option value="" disabled>
                              変更
                            </option>
                            {allowed.map((st) => (
                              <option key={st} value={st}>
                                {statusEntry(st).label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
