"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatJpy } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";

/**
 * BillingSplitPanel
 * ------------------------------------------------------------
 * 1 件の帳票 (documents) の「請求按分」(保険 / 自費 / その他) を
 * 一覧・編集する再利用可能なクライアントコンポーネント。
 * 帳票詳細ページや案件ワークフローのタブ内に埋め込んで使う。
 *
 * - 按分合計 vs 帳票総額 を可視化 (超過=赤 / 未按分=橙 / 完了=緑)
 * - readOnly のときは追加・削除ボタンを隠す
 */

type SplitType = "insurance" | "self_pay" | "other";

interface BillingSplit {
  id: string;
  document_id: string;
  split_type: SplitType;
  payer_name: string | null;
  claim_number: string | null;
  split_amount: number;
  split_ratio: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  documentId: string;
  documentTotal: number;
  readOnly?: boolean;
}

const SPLIT_TYPE_LABEL: Record<SplitType, string> = {
  insurance: "保険",
  self_pay: "自費",
  other: "その他",
};

const SPLIT_TYPE_BADGE: Record<SplitType, string> = {
  insurance: "bg-accent-dim text-accent",
  self_pay: "bg-success-dim text-success",
  other: "bg-inset text-secondary",
};

const SPLIT_TYPE_OPTIONS: { value: SplitType; label: string }[] = [
  { value: "insurance", label: "保険" },
  { value: "self_pay", label: "自費" },
  { value: "other", label: "その他" },
];

const inputCls =
  "w-full text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

interface FormState {
  split_type: SplitType;
  payer_name: string;
  claim_number: string;
  split_amount: string;
  split_ratio: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  split_type: "insurance",
  payer_name: "",
  claim_number: "",
  split_amount: "",
  split_ratio: "",
  notes: "",
};

export default function BillingSplitPanel({ documentId, documentTotal, readOnly = false }: Props) {
  const { toast } = useToast();
  const [splits, setSplits] = useState<BillingSplit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSplits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/billing-splits?document_id=${encodeURIComponent(documentId)}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setSplits(Array.isArray(data.splits) ? data.splits : []);
    } catch {
      toast("按分の読み込みに失敗しました", "error");
      setSplits([]);
    } finally {
      setLoading(false);
    }
  }, [documentId, toast]);

  useEffect(() => {
    fetchSplits();
  }, [fetchSplits]);

  const splitTotal = useMemo(() => splits.reduce((sum, s) => sum + (s.split_amount || 0), 0), [splits]);
  const remaining = documentTotal - splitTotal;

  function resetForm() {
    setForm(EMPTY_FORM);
    setShowForm(false);
  }

  async function handleAdd() {
    const amount = parseInt(form.split_amount, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      toast("金額を正しく入力してください", "error");
      return;
    }
    const ratioRaw = form.split_ratio.trim();
    const ratio = ratioRaw === "" ? null : Number(ratioRaw);
    if (ratio != null && (!Number.isFinite(ratio) || ratio < 0 || ratio > 100)) {
      toast("比率は0〜100で入力してください", "error");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/billing-splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          split_type: form.split_type,
          payer_name: form.payer_name.trim() || null,
          claim_number: form.claim_number.trim() || null,
          split_amount: amount,
          split_ratio: ratio,
          notes: form.notes.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "save failed");
      setSplits((prev) => [...prev, data.split as BillingSplit]);
      resetForm();
      toast("按分を追加しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "追加に失敗しました", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/billing-splits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message ?? "delete failed");
      }
      setSplits((prev) => prev.filter((s) => s.id !== id));
      toast("按分を削除しました", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "削除に失敗しました", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // 合計バッジの状態
  let summaryNode: React.ReactNode;
  if (remaining < 0) {
    summaryNode = <span className="text-danger font-medium">按分合計が請求額を超えています</span>;
  } else if (remaining > 0) {
    summaryNode = <span className="text-warning font-medium">未按分: {formatJpy(remaining)}</span>;
  } else {
    summaryNode = <span className="text-success font-medium">按分完了</span>;
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.18em] text-muted uppercase">Billing Split</div>
          <div className="mt-1 text-base font-semibold text-primary">請求按分（保険・自費）</div>
        </div>
        {!readOnly && !showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="btn-secondary text-xs px-3 py-1.5">
            + 按分を追加
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-5 flex items-center justify-center py-6">
          <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* 按分リスト */}
          {splits.length === 0 ? (
            <div className="mt-4 text-sm text-muted">按分はまだ登録されていません。</div>
          ) : (
            <ul className="mt-4 divide-y divide-border-default">
              {splits.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold shrink-0 ${SPLIT_TYPE_BADGE[s.split_type]}`}
                  >
                    {SPLIT_TYPE_LABEL[s.split_type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-primary">{s.payer_name || "（支払者未設定）"}</div>
                    {(s.claim_number || s.notes) && (
                      <div className="truncate text-xs text-muted">
                        {s.claim_number ? `請求番号: ${s.claim_number}` : ""}
                        {s.claim_number && s.notes ? " / " : ""}
                        {s.notes ?? ""}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-primary">{formatJpy(s.split_amount)}</div>
                    {s.split_ratio != null && <div className="text-xs text-muted">{s.split_ratio}%</div>}
                  </div>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      className="shrink-0 text-muted hover:text-danger transition-colors disabled:opacity-40"
                      aria-label="按分を削除"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* インライン追加フォーム */}
          {!readOnly && showForm && (
            <div className="mt-4 rounded-lg border border-border-default bg-surface p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-secondary">種別</span>
                  <select
                    value={form.split_type}
                    onChange={(e) => setForm((f) => ({ ...f, split_type: e.target.value as SplitType }))}
                    className={inputCls}
                  >
                    {SPLIT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-secondary">支払者名（保険会社 / 顧客）</span>
                  <input
                    type="text"
                    value={form.payer_name}
                    maxLength={120}
                    onChange={(e) => setForm((f) => ({ ...f, payer_name: e.target.value }))}
                    className={inputCls}
                    placeholder="例: ◯◯損害保険"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-secondary">金額（円）</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.split_amount}
                    onChange={(e) => setForm((f) => ({ ...f, split_amount: e.target.value }))}
                    className={inputCls}
                    placeholder="0"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-secondary">比率（%・任意）</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.split_ratio}
                    onChange={(e) => setForm((f) => ({ ...f, split_ratio: e.target.value }))}
                    className={inputCls}
                    placeholder="例: 70"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-secondary">保険請求番号（任意）</span>
                  <input
                    type="text"
                    value={form.claim_number}
                    maxLength={60}
                    onChange={(e) => setForm((f) => ({ ...f, claim_number: e.target.value }))}
                    className={inputCls}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-secondary">備考（任意）</span>
                  <input
                    type="text"
                    value={form.notes}
                    maxLength={500}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={saving}
                  className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving}
                  className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
                >
                  {saving ? "保存中..." : "追加する"}
                </button>
              </div>
            </div>
          )}

          {/* 合計サマリ */}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border-default pt-3 text-sm">
            <div className="text-secondary">
              合計 <span className="font-semibold text-primary">{formatJpy(splitTotal)}</span>
              <span className="text-muted"> / {formatJpy(documentTotal)}</span>
            </div>
            <div>{summaryNode}</div>
          </div>
        </>
      )}
    </div>
  );
}
