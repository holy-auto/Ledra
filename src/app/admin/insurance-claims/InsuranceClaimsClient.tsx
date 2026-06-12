"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";
import {
  INSURANCE_CLAIM_STATUSES,
  INSURANCE_CLAIM_STATUS_LABEL,
  INSURANCE_CLAIM_STATUS_COLOR,
  type InsuranceClaimStatus,
} from "@/lib/validations/insurance-claim";

// ─── 型定義 ──────────────────────────────────────────────────────
export interface InsuranceClaim {
  id: string;
  body_repair_job_id: string | null;
  reservation_id: string | null;
  insurance_company: string;
  claim_number: string | null;
  adjuster_name: string | null;
  adjuster_phone: string | null;
  status: InsuranceClaimStatus;
  adjuster_visit_date: string | null;
  agreed_amount: number | null;
  deductible_amount: number | null;
  customer_burden: number | null;
  submitted_at: string | null;
  agreed_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  body_repair_job?: { id: string; stage: string } | null;
}

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
export function formatYen(n: number | null): string {
  if (n == null) return "—";
  return `¥${n.toLocaleString("ja-JP")}`;
}

type FilterTab = "all" | "in_progress" | "agreed" | "paid";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "全件" },
  { key: "in_progress", label: "協定中" },
  { key: "agreed", label: "協定済" },
  { key: "paid", label: "支払済" },
];

const IN_PROGRESS_STATUSES: InsuranceClaimStatus[] = ["pending", "adjuster_scheduled", "adjuster_visited"];

// ─── ステータスバッジ ───
export function StatusBadge({ status }: { status: InsuranceClaimStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${INSURANCE_CLAIM_STATUS_COLOR[status]}`}
    >
      {INSURANCE_CLAIM_STATUS_LABEL[status]}
    </span>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function InsuranceClaimsClient() {
  const [claims, setClaims] = useState<InsuranceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<InsuranceClaim | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/insurance-claims");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setClaims(Array.isArray(data.claims) ? data.claims : []);
    } catch (e) {
      console.error(e);
      showToast("error", "保険協定の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const filtered = useMemo(() => {
    if (filter === "all") return claims;
    if (filter === "in_progress") return claims.filter((c) => IN_PROGRESS_STATUSES.includes(c.status));
    if (filter === "agreed") return claims.filter((c) => c.status === "agreed");
    if (filter === "paid") return claims.filter((c) => c.status === "paid");
    return claims;
  }, [claims, filter]);

  const counts = useMemo(() => {
    return {
      all: claims.length,
      in_progress: claims.filter((c) => IN_PROGRESS_STATUSES.includes(c.status)).length,
      agreed: claims.filter((c) => c.status === "agreed").length,
      paid: claims.filter((c) => c.status === "paid").length,
    } as Record<FilterTab, number>;
  }, [claims]);

  return (
    <div className="mx-auto max-w-[1400px] pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">保険協定・アジャスター連携</h1>
          <p className="mt-1 text-sm text-secondary">鈑金案件の損保協定状況とアジャスター訪問を管理します</p>
        </div>
        <MutationGuard>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            保険協定を登録
          </button>
        </MutationGuard>
      </div>

      {/* フィルタタブ */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-border-default">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              filter === t.key ? "border-accent text-accent" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {t.label}
            <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] text-muted">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* テーブル */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-sm text-muted">該当する保険協定はありません</div>
      ) : (
        <div className="glass-card overflow-hidden rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">保険会社</th>
                  <th className="px-4 py-3 font-medium">請求番号</th>
                  <th className="px-4 py-3 font-medium">アジャスター</th>
                  <th className="px-4 py-3 font-medium text-right">協定金額</th>
                  <th className="px-4 py-3 font-medium text-right">顧客負担</th>
                  <th className="px-4 py-3 font-medium">状態</th>
                  <th className="px-4 py-3 font-medium">提出日</th>
                  <th className="px-4 py-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-b border-border-subtle last:border-0 hover:bg-surface-hover">
                    <td className="px-4 py-2.5 font-medium text-primary">{c.insurance_company}</td>
                    <td className="px-4 py-2.5 text-secondary">{c.claim_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-secondary">
                      {c.adjuster_name ?? "—"}
                      {c.adjuster_phone && <span className="ml-1 text-xs text-muted">({c.adjuster_phone})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-accent">{formatYen(c.agreed_amount)}</td>
                    <td className="px-4 py-2.5 text-right text-secondary">{formatYen(c.customer_burden)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-muted">{c.submitted_at ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <MutationGuard>
                        <button
                          onClick={() => setEditing(c)}
                          className="rounded-md border border-border-default px-2.5 py-1 text-xs font-medium text-secondary transition-colors hover:bg-surface-active hover:text-primary"
                        >
                          編集
                        </button>
                      </MutationGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 新規作成ダイアログ */}
      {createOpen && (
        <ClaimDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            showToast("success", "保険協定を登録しました");
            await fetchClaims();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 編集ダイアログ */}
      {editing && (
        <ClaimDialog
          mode="edit"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            showToast("success", "保険協定を更新しました");
            await fetchClaims();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white shadow-xl ${
            toast.type === "success" ? "bg-accent" : "bg-danger"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 作成/編集ダイアログ (共通) ───
export function ClaimDialog({
  mode,
  existing,
  presetJobId,
  onClose,
  onSaved,
  onError,
}: {
  mode: "create" | "edit";
  existing?: InsuranceClaim;
  /** 鈑金案件ミニパネルから新規作成する際に紐付ける job id */
  presetJobId?: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [insuranceCompany, setInsuranceCompany] = useState(existing?.insurance_company ?? "");
  const [claimNumber, setClaimNumber] = useState(existing?.claim_number ?? "");
  const [adjusterName, setAdjusterName] = useState(existing?.adjuster_name ?? "");
  const [adjusterPhone, setAdjusterPhone] = useState(existing?.adjuster_phone ?? "");
  const [status, setStatus] = useState<InsuranceClaimStatus>(existing?.status ?? "pending");
  const [adjusterVisitDate, setAdjusterVisitDate] = useState(existing?.adjuster_visit_date ?? "");
  const [agreedAmount, setAgreedAmount] = useState(
    existing?.agreed_amount != null ? String(existing.agreed_amount) : "",
  );
  const [deductibleAmount, setDeductibleAmount] = useState(
    existing?.deductible_amount != null ? String(existing.deductible_amount) : "",
  );
  const [customerBurden, setCustomerBurden] = useState(
    existing?.customer_burden != null ? String(existing.customer_burden) : "",
  );
  const [submittedAt, setSubmittedAt] = useState(existing?.submitted_at ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const numOrNull = (v: string): number | null => {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  async function submit() {
    if (!insuranceCompany.trim()) {
      onError("保険会社を入力してください。");
      return;
    }
    const agreed = numOrNull(agreedAmount);
    const deductible = numOrNull(deductibleAmount);
    const burden = numOrNull(customerBurden);
    if (agreed != null && (!Number.isInteger(agreed) || agreed <= 0)) {
      onError("協定金額は 0 より大きい整数で入力してください。");
      return;
    }
    if (deductible != null && (!Number.isInteger(deductible) || deductible < 0)) {
      onError("免責金額は 0 以上の整数で入力してください。");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        insurance_company: insuranceCompany.trim(),
        claim_number: claimNumber.trim() || null,
        adjuster_name: adjusterName.trim() || null,
        adjuster_phone: adjusterPhone.trim() || null,
        status,
        adjuster_visit_date: adjusterVisitDate || null,
        agreed_amount: agreed,
        deductible_amount: deductible,
        customer_burden: burden,
        submitted_at: submittedAt || null,
        notes: notes.trim() || null,
      };
      if (mode === "edit" && existing) {
        payload.id = existing.id;
      } else if (presetJobId) {
        payload.body_repair_job_id = presetJobId;
      }

      const res = await fetch("/api/admin/insurance-claims", {
        method: mode === "edit" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "save failed");
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title={mode === "edit" ? "保険協定の編集" : "保険協定を登録"} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="保険会社" required>
            <input
              value={insuranceCompany}
              onChange={(e) => setInsuranceCompany(e.target.value)}
              placeholder="例: ○○損保"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="請求番号">
            <input
              value={claimNumber}
              onChange={(e) => setClaimNumber(e.target.value)}
              placeholder="例: 2026-00123"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="アジャスター名">
            <input
              value={adjusterName}
              onChange={(e) => setAdjusterName(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="アジャスター電話">
            <input
              value={adjusterPhone}
              onChange={(e) => setAdjusterPhone(e.target.value)}
              placeholder="例: 03-0000-0000"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="状態">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InsuranceClaimStatus)}
              className={`w-full ${inputCls}`}
            >
              {INSURANCE_CLAIM_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {INSURANCE_CLAIM_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="アジャスター訪問日">
            <input
              type="date"
              value={adjusterVisitDate}
              onChange={(e) => setAdjusterVisitDate(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="協定金額（円）">
            <input
              type="number"
              min={1}
              value={agreedAmount}
              onChange={(e) => setAgreedAmount(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="免責金額（円）">
            <input
              type="number"
              min={0}
              value={deductibleAmount}
              onChange={(e) => setDeductibleAmount(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="顧客負担（円）">
            <input
              type="number"
              min={0}
              value={customerBurden}
              onChange={(e) => setCustomerBurden(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <Field label="提出日">
          <input
            type="date"
            value={submittedAt}
            onChange={(e) => setSubmittedAt(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </Field>

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="協定内容・特記事項など"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>
      <DialogActions
        onClose={onClose}
        onSubmit={submit}
        submitting={submitting}
        submitLabel={mode === "edit" ? "保存する" : "登録する"}
      />
    </DialogShell>
  );
}

// ─── 共通ダイアログパーツ ───
function DialogShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-primary">{title}</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-secondary">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function DialogActions({
  onClose,
  onSubmit,
  submitting,
  submitLabel,
}: {
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button
        onClick={onClose}
        className="rounded-lg bg-inset px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-surface-active"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        {submitting ? "処理中…" : submitLabel}
      </button>
    </div>
  );
}
