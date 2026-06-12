"use client";

import { useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import { fetcher } from "@/lib/swr";
import { parseJsonSafe } from "@/lib/api/safeJson";
import { formatJpy } from "@/lib/format";

/* ---------- Types ---------- */

type LedgerRow = {
  document_id: string;
  doc_number: string;
  doc_type: string;
  customer_id: string | null;
  customer_name: string | null;
  issued_at: string | null;
  status: string;
  total: number;
  paid: number;
  outstanding: number;
};

type PaymentEntry = {
  id: string;
  document_id: string;
  customer_id: string | null;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_no: string | null;
  notes: string | null;
  doc_number: string | null;
  customer_name: string | null;
};

type LedgerData = { ledger: LedgerRow[]; stats: { total_outstanding: number; document_count: number } };
type EntriesData = { entries: PaymentEntry[]; stats: { total: number; total_amount: number } };

/* ---------- Constants ---------- */

const PAYMENT_METHODS = [
  { value: "cash", label: "現金" },
  { value: "bank_transfer", label: "振込" },
  { value: "credit_card", label: "クレジット" },
  { value: "qr", label: "QRコード" },
  { value: "other", label: "その他" },
] as const;

const METHOD_LABELS: Record<string, string> = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label]));

/* ---------- Helpers ---------- */

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ---------- Component ---------- */

export default function PaymentLedgerClient() {
  const [tab, setTab] = useState<"ledger" | "history">("ledger");

  // 売掛元帳
  const {
    data: ledgerData,
    isLoading: ledgerLoading,
    mutate: mutateLedger,
  } = useSWR<LedgerData>("/api/admin/payment-entries/ledger", fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // 入金履歴 (日付フィルタ)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const historyKey = (() => {
    const params = new URLSearchParams();
    if (fromDate) params.set("from_date", fromDate);
    if (toDate) params.set("to_date", toDate);
    const qs = params.toString();
    return `/api/admin/payment-entries${qs ? `?${qs}` : ""}`;
  })();
  const {
    data: historyData,
    isLoading: historyLoading,
    mutate: mutateHistory,
  } = useSWR<EntriesData>(tab === "history" ? historyKey : null, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  // 入金登録ダイアログ
  const [dialogRow, setDialogRow] = useState<LedgerRow | null>(null);
  const [payDate, setPayDate] = useState(todayIso());
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const openDialog = (row: LedgerRow) => {
    setDialogRow(row);
    setPayDate(todayIso());
    setPayAmount(String(row.outstanding));
    setPayMethod("cash");
    setPayRef("");
    setPayNotes("");
    setMsg(null);
  };

  const closeDialog = () => setDialogRow(null);

  const handleSubmit = async () => {
    if (!dialogRow) return;
    const amount = parseInt(payAmount, 10);
    if (isNaN(amount) || amount <= 0) {
      setMsg({ text: "金額は1以上で入力してください。", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/payment-entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document_id: dialogRow.document_id,
          amount,
          payment_method: payMethod,
          payment_date: payDate,
          reference_no: payRef.trim() || null,
          notes: payNotes.trim() || null,
        }),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "入金を登録しました", ok: true });
      closeDialog();
      await Promise.all([mutateLedger(), mutateHistory()]);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("この入金記録を削除しますか？")) return;
    try {
      const res = await fetch(`/api/admin/payment-entries?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setMsg({ text: "入金記録を削除しました", ok: true });
      await Promise.all([mutateHistory(), mutateLedger()]);
    } catch (e: any) {
      setMsg({ text: e?.message ?? String(e), ok: false });
    }
  };

  /* ---------- Render ---------- */

  const ledger = ledgerData?.ledger ?? [];
  const entries = historyData?.entries ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader tag="経理" title="売掛元帳" description="帳票ごとの売掛残高の確認と入金登録を行います。" />

      {msg && <div className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border-default">
        <button
          type="button"
          onClick={() => setTab("ledger")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "ledger" ? "border-accent text-accent" : "border-transparent text-muted hover:text-secondary"
          }`}
        >
          売掛元帳
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "history" ? "border-accent text-accent" : "border-transparent text-muted hover:text-secondary"
          }`}
        >
          入金履歴
        </button>
      </div>

      {/* ─── 売掛元帳タブ ─── */}
      {tab === "ledger" && (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">売掛残高合計</div>
              <div className="mt-2 text-2xl font-bold text-danger">
                {formatJpy(ledgerData?.stats.total_outstanding ?? 0)}
              </div>
            </div>
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">未回収件数</div>
              <div className="mt-2 text-2xl font-bold text-primary">{ledgerData?.stats.document_count ?? 0}</div>
              <div className="mt-1 text-xs text-muted">件</div>
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">伝票番号</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted sm:table-cell">
                      発行日
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                    <th className="hidden px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted sm:table-cell">
                      入金済
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">残高</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {ledgerLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        読み込み中…
                      </td>
                    </tr>
                  )}
                  {!ledgerLoading &&
                    ledger.map((row) => (
                      <tr key={row.document_id} className="hover:bg-surface-hover/60">
                        <td className="px-4 py-3 text-primary">{row.customer_name ?? "-"}</td>
                        <td className="px-4 py-3 font-medium text-primary">{row.doc_number}</td>
                        <td className="hidden px-4 py-3 text-secondary sm:table-cell">{formatDate(row.issued_at)}</td>
                        <td className="px-4 py-3 text-right text-secondary">{formatJpy(row.total)}</td>
                        <td className="hidden px-4 py-3 text-right text-secondary sm:table-cell">
                          {formatJpy(row.paid)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={row.outstanding > 0 ? "font-semibold text-danger" : "text-muted"}>
                            {formatJpy(row.outstanding)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="btn-primary px-3 py-1 text-xs"
                            onClick={() => openDialog(row)}
                          >
                            入金登録
                          </button>
                        </td>
                      </tr>
                    ))}
                  {!ledgerLoading && ledger.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        未回収の売掛はありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ─── 入金履歴タブ ─── */}
      {tab === "history" && (
        <>
          <section className="glass-card flex flex-wrap items-end gap-4 p-5">
            <div className="space-y-1">
              <label className="text-xs text-muted">開始日</label>
              <input
                type="date"
                className="input-field"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">終了日</label>
              <input type="date" className="input-field" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
            {(fromDate || toDate) && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                }}
              >
                クリア
              </button>
            )}
            <div className="ml-auto text-sm text-muted">
              合計 <span className="font-semibold text-primary">{formatJpy(historyData?.stats.total_amount ?? 0)}</span>
            </div>
          </section>

          <section className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-surface-hover">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">入金日</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">顧客</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">伝票</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">金額</th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted sm:table-cell">
                      方法
                    </th>
                    <th className="hidden px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-muted md:table-cell">
                      摘要
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
                  {historyLoading && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        読み込み中…
                      </td>
                    </tr>
                  )}
                  {!historyLoading &&
                    entries.map((e) => (
                      <tr key={e.id} className="hover:bg-surface-hover/60">
                        <td className="px-4 py-3 text-secondary">{formatDate(e.payment_date)}</td>
                        <td className="px-4 py-3 text-primary">{e.customer_name ?? "-"}</td>
                        <td className="px-4 py-3 text-secondary">{e.doc_number ?? "-"}</td>
                        <td className="px-4 py-3 text-right font-medium text-primary">{formatJpy(e.amount)}</td>
                        <td className="hidden px-4 py-3 text-secondary sm:table-cell">
                          {METHOD_LABELS[e.payment_method] ?? e.payment_method}
                        </td>
                        <td className="hidden px-4 py-3 text-secondary md:table-cell">
                          {[e.reference_no, e.notes].filter(Boolean).join(" / ") || "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="btn-ghost px-3 py-1 text-xs text-danger"
                            onClick={() => handleDeleteEntry(e.id)}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  {!historyLoading && entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-muted">
                        入金履歴がありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* ─── 入金登録ダイアログ ─── */}
      {dialogRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeDialog}
          role="presentation"
        >
          <div
            className="glass-card w-full max-w-md space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div>
              <div className="text-base font-semibold text-primary">入金登録</div>
              <div className="mt-1 text-xs text-muted">
                伝票 {dialogRow.doc_number}
                {dialogRow.customer_name ? ` / ${dialogRow.customer_name}` : ""} ・ 残高{" "}
                <span className="font-semibold text-danger">{formatJpy(dialogRow.outstanding)}</span>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted">入金日</label>
              <input type="date" className="input-field" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">
                金額 <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="1"
                className="input-field"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">入金方法</label>
              <select className="select-field" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">参照番号 (振込番号等)</label>
              <input type="text" className="input-field" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">摘要</label>
              <input
                type="text"
                className="input-field"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-ghost" onClick={closeDialog}>
                キャンセル
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={handleSubmit}>
                {saving ? "登録中…" : "登録"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
