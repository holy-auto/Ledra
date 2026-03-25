"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Badge from "@/components/ui/Badge";
import { formatDate, formatJpy } from "@/lib/format";
import type { BadgeVariant } from "@/lib/statusMaps";

type Invoice = {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
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

type InvoiceLine = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
};

type AgentInfo = {
  name: string;
  contact_name: string;
  contact_email: string;
  address: string;
};

const STATUS_MAP: Record<string, { variant: BadgeVariant; label: string }> = {
  draft: { variant: "default", label: "下書き" },
  issued: { variant: "info", label: "発行済" },
  paid: { variant: "success", label: "支払済" },
  cancelled: { variant: "danger", label: "キャンセル" },
};

export default function AgentInvoicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) { window.location.href = "/agent/login"; return; }
      setReady(true);
      const res = await fetch("/api/agent/invoices");
      if (res.ok) setInvoices((await res.json()).invoices ?? []);
      setLoading(false);
    })();
  }, [supabase]);

  const openDetail = async (inv: Invoice) => {
    setSelectedInvoice(inv);
    setDetailLoading(true);
    const res = await fetch(`/api/agent/invoices/${inv.id}`);
    if (res.ok) {
      const json = await res.json();
      setLines(json.lines ?? []);
      setAgent(json.agent ?? null);
    }
    setDetailLoading(false);
  };

  const printInvoice = () => {
    window.print();
  };

  if (!ready) return null;

  // Detail view
  if (selectedInvoice) {
    const st = STATUS_MAP[selectedInvoice.status] ?? STATUS_MAP.draft;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedInvoice(null)} className="text-sm text-neutral-500 hover:text-neutral-700">
            &larr; 請求書一覧に戻る
          </button>
          <button onClick={printInvoice} className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
            印刷 / PDF
          </button>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm print:shadow-none print:border-0" id="invoice-print">
          {/* Invoice header */}
          <div className="flex items-start justify-between border-b border-neutral-200 pb-6">
            <div>
              <h1 className="text-2xl font-bold text-neutral-900">請求書</h1>
              <div className="mt-1 text-sm text-neutral-500">INVOICE</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-neutral-900">CARTRUST</div>
              <div className="mt-1 text-xs text-neutral-500">株式会社CARTRUST</div>
            </div>
          </div>

          {/* Invoice info */}
          <div className="mt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-neutral-400 mb-1">請求先</div>
              <div className="text-sm font-semibold text-neutral-900">{agent?.name ?? "-"}</div>
              <div className="text-xs text-neutral-500">{agent?.contact_name}</div>
              <div className="text-xs text-neutral-500">{agent?.address}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-400 mb-1">請求書情報</div>
              <div className="text-sm">
                <span className="text-neutral-500">番号: </span>
                <span className="font-mono font-semibold">{selectedInvoice.invoice_number}</span>
              </div>
              <div className="text-xs text-neutral-500">
                期間: {formatDate(selectedInvoice.period_start)} 〜 {formatDate(selectedInvoice.period_end)}
              </div>
              <div className="mt-1">
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
            </div>
          </div>

          {/* Line items */}
          {detailLoading ? (
            <div className="mt-6 animate-pulse h-32 rounded bg-neutral-100" />
          ) : (
            <table className="mt-6 w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 text-left font-medium">項目</th>
                  <th className="py-2 text-right font-medium w-20">数量</th>
                  <th className="py-2 text-right font-medium w-28">単価</th>
                  <th className="py-2 text-right font-medium w-28">金額</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-neutral-100">
                    <td className="py-3 text-neutral-900">{line.description}</td>
                    <td className="py-3 text-right text-neutral-600">{line.quantity}</td>
                    <td className="py-3 text-right font-mono text-neutral-600">{formatJpy(line.unit_price)}</td>
                    <td className="py-3 text-right font-mono font-semibold text-neutral-900">{formatJpy(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <div className="mt-4 border-t border-neutral-200 pt-4">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">小計</span>
                  <span className="font-mono">{formatJpy(selectedInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">消費税 ({selectedInvoice.tax_rate}%)</span>
                  <span className="font-mono">{formatJpy(selectedInvoice.tax_amount)}</span>
                </div>
                <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-bold">
                  <span>合計</span>
                  <span className="font-mono">{formatJpy(selectedInvoice.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {selectedInvoice.notes && (
            <div className="mt-6 rounded-xl bg-neutral-50 p-4 text-xs text-neutral-500">
              <div className="font-semibold mb-1">備考</div>
              {selectedInvoice.notes}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
          INVOICES
        </div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">請求書</h1>
        <p className="mt-1 text-sm text-neutral-500">コミッション支払いの請求書一覧</p>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-neutral-100" />)}
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          請求書はまだありません
        </div>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="p-3 text-left font-semibold text-neutral-500">請求書番号</th>
                <th className="p-3 text-left font-semibold text-neutral-500">期間</th>
                <th className="p-3 text-right font-semibold text-neutral-500">合計</th>
                <th className="p-3 text-left font-semibold text-neutral-500">ステータス</th>
                <th className="p-3 text-left font-semibold text-neutral-500">発行日</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const st = STATUS_MAP[inv.status] ?? STATUS_MAP.draft;
                return (
                  <tr key={inv.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="p-3 font-mono font-semibold text-neutral-900">{inv.invoice_number}</td>
                    <td className="p-3 text-neutral-600">
                      {formatDate(inv.period_start)} 〜 {formatDate(inv.period_end)}
                    </td>
                    <td className="p-3 text-right font-mono font-bold text-neutral-900">{formatJpy(inv.total)}</td>
                    <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                    <td className="p-3 text-neutral-500">{inv.issued_at ? formatDate(inv.issued_at) : "-"}</td>
                    <td className="p-3">
                      <button
                        onClick={() => openDetail(inv)}
                        className="text-xs font-medium text-neutral-600 hover:text-neutral-900"
                      >
                        詳細
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
