"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import MutationGuard from "@/components/ui/MutationGuard";
import InsuranceClaimMiniPanel from "./InsuranceClaimMiniPanel";
import {
  BODY_REPAIR_STAGES,
  BODY_REPAIR_STAGE_LABEL,
  BODY_REPAIR_STAGE_COLOR,
  BODY_REPAIR_NEXT_STAGE,
  type BodyRepairStage,
} from "@/lib/validations/body-repair-job";

// ─── 型定義 ──────────────────────────────────────────────────────
interface JobCustomer {
  id: string;
  name: string;
  phone: string | null;
}
interface JobVehicle {
  id: string;
  maker: string | null;
  model: string | null;
  plate_display: string | null;
}
interface BodyRepairJob {
  id: string;
  reservation_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  stage: BodyRepairStage;
  estimate_amount: number | null;
  insurance_company: string | null;
  claim_number: string | null;
  assigned_staff_id: string | null;
  intake_at: string | null;
  estimate_at: string | null;
  bodywork_start_at: string | null;
  paint_start_at: string | null;
  complete_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer: JobCustomer | null;
  vehicle: JobVehicle | null;
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
}

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function vehicleLabel(v: JobVehicle | null): string {
  if (!v) return "車両未設定";
  return [v.maker, v.model, v.plate_display].filter(Boolean).join(" ") || "車両未設定";
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return null;
  const diff = Date.now() - start;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function formatAmount(n: number | null): string | null {
  if (n == null) return null;
  return `¥${n.toLocaleString("ja-JP")}`;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function BodyRepairClient() {
  const [jobs, setJobs] = useState<BodyRepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/body-repair-jobs");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (e) {
      console.error(e);
      showToast("error", "案件の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const advanceStage = useCallback(
    async (job: BodyRepairJob) => {
      const next = BODY_REPAIR_NEXT_STAGE[job.stage];
      if (!next) return;
      setBusyId(job.id);
      try {
        const res = await fetch("/api/admin/body-repair-jobs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: job.id, stage: next }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "update failed");
        }
        showToast("success", `「${BODY_REPAIR_STAGE_LABEL[next]}」へ進めました`);
        await fetchJobs();
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [fetchJobs, showToast],
  );

  // ステージごとに案件をグルーピングする。
  const byStage = useMemo(() => {
    const map = new Map<BodyRepairStage, BodyRepairJob[]>();
    for (const stage of BODY_REPAIR_STAGES) map.set(stage, []);
    for (const job of jobs) {
      const list = map.get(job.stage);
      if (list) list.push(job);
    }
    return map;
  }, [jobs]);

  return (
    <div className="mx-auto max-w-[1600px] pb-20">
      {/* ヘッダー */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">鈑金工程管理</h1>
          <p className="mt-1 text-sm text-secondary">
            受付 → 協定 → 鈑金 → 塗装 → 完成 → 出庫 の工程を案件ごとに管理します
          </p>
        </div>
        <MutationGuard>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            新規案件
          </button>
        </MutationGuard>
      </div>

      {/* Kanban ボード */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {BODY_REPAIR_STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            return (
              <div key={stage} className="glass-card flex min-w-[200px] flex-1 flex-col rounded-xl p-2">
                <div
                  className={`mb-2 flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm font-semibold ${BODY_REPAIR_STAGE_COLOR[stage]}`}
                >
                  <span>{BODY_REPAIR_STAGE_LABEL[stage]}</span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{list.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {list.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted">案件なし</p>
                  ) : (
                    list.map((job) => (
                      <JobCard key={job.id} job={job} busy={busyId === job.id} onAdvance={() => advanceStage(job)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規作成ダイアログ */}
      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            showToast("success", "案件を作成しました");
            await fetchJobs();
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

// ─── 案件カード ───
function JobCard({ job, busy, onAdvance }: { job: BodyRepairJob; busy: boolean; onAdvance: () => void }) {
  const next = BODY_REPAIR_NEXT_STAGE[job.stage];
  const days = daysSince(job.intake_at);
  const amount = formatAmount(job.estimate_amount);
  const [showClaims, setShowClaims] = useState(false);

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="truncate text-sm font-semibold text-primary">{job.customer?.name ?? "顧客未設定"}</div>
      <div className="mt-0.5 truncate text-xs text-secondary">{vehicleLabel(job.vehicle)}</div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BODY_REPAIR_STAGE_COLOR[job.stage]}`}
        >
          {BODY_REPAIR_STAGE_LABEL[job.stage]}
        </span>
        {amount && <span className="text-xs font-semibold text-accent">{amount}</span>}
      </div>

      {job.insurance_company && <div className="mt-1 truncate text-[11px] text-muted">{job.insurance_company}</div>}

      <div className="mt-2 flex items-center justify-between gap-2">
        {days != null ? (
          <span className="text-[11px] text-muted">受付から {days} 日</span>
        ) : (
          <span className="text-[11px] text-muted">&nbsp;</span>
        )}
        {next && (
          <MutationGuard>
            <button
              disabled={busy}
              onClick={onAdvance}
              className="shrink-0 rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? "…" : `→ ${BODY_REPAIR_STAGE_LABEL[next]}へ`}
            </button>
          </MutationGuard>
        )}
      </div>

      {/* 損保協定パネル (折りたたみ) */}
      <button
        type="button"
        onClick={() => setShowClaims((v) => !v)}
        className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[11px] text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
      >
        <svg
          className={`h-3 w-3 transition-transform ${showClaims ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        損保協定
      </button>
      {showClaims && (
        <div className="mt-2">
          <InsuranceClaimMiniPanel bodyRepairJobId={job.id} />
        </div>
      )}
    </div>
  );
}

// ─── 新規作成ダイアログ ───
function CreateDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  // 顧客検索 (debounce): /api/admin/customers?q=
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ per_page: "20" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/admin/customers?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.customers ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setCustomers(
          list.map((c) => ({
            id: String(c.id),
            name: String(c.name ?? ""),
            phone: c.phone ? String(c.phone) : null,
          })),
        );
      } catch {
        /* 検索失敗時は候補を空に */
      } finally {
        if (active) setSearching(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  async function submit() {
    if (estimateAmount && (!Number.isInteger(Number(estimateAmount)) || Number(estimateAmount) < 0)) {
      onError("見積金額は 0 以上の整数で入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/body-repair-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          stage: "intake",
          estimate_amount: estimateAmount ? Number(estimateAmount) : null,
          insurance_company: insuranceCompany.trim() || null,
          claim_number: claimNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="新規案件" onClose={onClose}>
      <div className="space-y-4">
        <Field label="顧客を検索">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名前・電話・メールで検索"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <div className="max-h-44 overflow-y-auto rounded-md border border-border-subtle">
          <button
            type="button"
            onClick={() => setCustomerId("")}
            className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
              customerId === "" ? "bg-accent/15 text-accent" : "text-secondary"
            }`}
          >
            （顧客を指定しない）
          </button>
          {searching && customers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">検索中…</div>
          ) : customers.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">該当する顧客がいません</div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCustomerId(c.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover ${
                  customerId === c.id ? "bg-accent/15 text-accent" : "text-primary"
                }`}
              >
                <span className="truncate">{c.name}</span>
                {c.phone && <span className="ml-2 shrink-0 text-xs text-muted">{c.phone}</span>}
              </button>
            ))
          )}
        </div>

        <Field label="見積金額（円）">
          <input
            type="number"
            min={0}
            value={estimateAmount}
            onChange={(e) => setEstimateAmount(e.target.value)}
            placeholder="例: 180000"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="保険会社">
            <input
              value={insuranceCompany}
              onChange={(e) => setInsuranceCompany(e.target.value)}
              placeholder="例: ○○損保"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="受付番号">
            <input
              value={claimNumber}
              onChange={(e) => setClaimNumber(e.target.value)}
              placeholder="例: 2026-00123"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="損傷箇所・特記事項など"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="作成する" />
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
        className="glass-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-6"
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
