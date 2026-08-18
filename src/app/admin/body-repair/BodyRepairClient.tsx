"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import nextDynamic from "next/dynamic";
import MutationGuard from "@/components/ui/MutationGuard";
import PageHeader from "@/components/ui/PageHeader";
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import {
  BODY_REPAIR_STAGES,
  BODY_REPAIR_STAGE_LABEL,
  BODY_REPAIR_STAGE_COLOR,
  BODY_REPAIR_NEXT_STAGE,
  CLAIM_STATUSES,
  CLAIM_STATUS_LABEL,
  type BodyRepairStage,
} from "@/lib/validations/body-repair-job";

const VoiceMemoPanel = nextDynamic(() => import("@/app/admin/certificates/new/VoiceMemoPanel"), { ssr: false });

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
interface WorkContent {
  repair_type?: string;
  panels?: string[];
  methods?: string;
  parts?: string;
  paint?: string;
}
interface BodyRepairJob {
  id: string;
  reservation_id: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  stage: BodyRepairStage;
  estimate_amount: number | null;
  actual_amount: number | null;
  due_date: string | null;
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
  // ガイドライン準拠フィールド
  planned_work_json: WorkContent | null;
  actual_work_json: WorkContent | null;
  deviation_reason: string | null;
  is_specified_maintenance: boolean;
  record_retention_until: string | null;
  estimate_document_id: string | null;
  insurer_case_id: string | null;
  claim_status: string | null;
  claim_approved_amount: number | null;
  claim_decided_at: string | null;
  customer: JobCustomer | null;
  vehicle: JobVehicle | null;
}

interface VehicleOption {
  id: string;
  label: string;
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

/** 保険査定ステータスのチップ配色。承認=緑 / 一部=琥珀 / 差戻=赤 / 提出済=青。 */
function claimChipCls(status: string): string {
  switch (status) {
    case "approved":
      return "border-green-500/40 bg-green-500/15 text-green-300";
    case "partial":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    case "rejected":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    default:
      return "border-blue-500/40 bg-blue-500/15 text-blue-300";
  }
}

/** JST の当日 (YYYY-MM-DD)。納期の超過判定に使う。 */
function jstTodayDate(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 納期の状態。出庫済みは対象外。YYYY-MM-DD は辞書順比較で日付比較になる。
 *   overdue … 期限超過 / today … 本日締切 / soon … 翌日締切 / null … 余裕あり or 未設定
 */
function dueState(job: BodyRepairJob): "overdue" | "today" | "soon" | null {
  if (!job.due_date || job.stage === "delivered") return null;
  const today = jstTodayDate();
  if (job.due_date < today) return "overdue";
  if (job.due_date === today) return "today";
  const tomorrow = new Date(Date.now() + 9 * 3_600_000 + 86_400_000).toISOString().slice(0, 10);
  if (job.due_date === tomorrow) return "soon";
  return null;
}

function formatDueLabel(due: string): string {
  // YYYY-MM-DD → M/D
  const [, m, d] = due.split("-");
  return `${Number(m)}/${Number(d)}`;
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function BodyRepairClient() {
  const [jobs, setJobs] = useState<BodyRepairJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editJob, setEditJob] = useState<BodyRepairJob | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 工程タブ: "all" = 全工程をカンバン表示 / 各工程 = その工程の案件のみ
  const [activeStage, setActiveStage] = useState<"all" | BodyRepairStage>("all");
  // 音声→備考 (ai_draft) / AI 見積 (ai_invoice_quote)。current tenant の plan_tier から判定。
  const [canAiNote, setCanAiNote] = useState(false);
  const [canAiQuote, setCanAiQuote] = useState(false);
  // 納期チップは JST 当日基準。開きっぱなしでも日付境界で再計算するための tick。
  const [, setDayTick] = useState(0);

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

  // JST 日付境界で納期チップ (超過/本日/明日) を再計算する。開きっぱなしの
  // 運用画面で「本日締切」が翌日に「超過」へ自動で切り替わるようにする。
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = Date.now();
      const jst = new Date(now + 9 * 3_600_000);
      const nextJstMidnightUtc =
        Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() + 1) - 9 * 3_600_000;
      const ms = Math.max(1_000, nextJstMidnightUtc - now);
      timer = setTimeout(() => {
        setDayTick((t) => t + 1);
        schedule();
      }, ms);
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  // 現在テナントの plan_tier から音声→備考の可否を判定。
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/tenants");
        if (!res.ok) return;
        const data = await res.json();
        const current = data?.tenants?.find((t: { is_current?: boolean }) => t.is_current) ?? data?.tenants?.[0];
        if (alive && current?.plan_tier) {
          const tier = normalizePlanTier(current.plan_tier);
          setCanAiNote(canUseFeature(tier, "ai_draft"));
          setCanAiQuote(canUseFeature(tier, "ai_invoice_quote"));
        }
      } catch {
        /* plan 取得失敗時は非表示のまま (API 側でも 403 ガード) */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
      {/* ヘッダー + 工程タブ（L3 ページバー） */}
      <PageHeader
        tag="鈑金"
        title="鈑金工程管理"
        actions={
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
        }
        tabs={[
          { key: "all", label: "すべて", badge: jobs.length },
          ...BODY_REPAIR_STAGES.map((stage) => ({
            key: stage,
            label: BODY_REPAIR_STAGE_LABEL[stage],
            badge: (byStage.get(stage) ?? []).length,
          })),
        ]}
        activeTab={activeStage}
        onTabSelect={(k) => setActiveStage(k as "all" | BodyRepairStage)}
      />

      {/* 工程ビュー: すべて=カンバン / 単一工程=カード一覧 */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : activeStage === "all" ? (
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
                      <JobCard
                        key={job.id}
                        job={job}
                        busy={busyId === job.id}
                        onAdvance={() => advanceStage(job)}
                        onEdit={() => setEditJob(job)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (byStage.get(activeStage) ?? []).length === 0 ? (
        <p className="glass-card rounded-xl px-4 py-16 text-center text-sm text-muted">
          「{BODY_REPAIR_STAGE_LABEL[activeStage]}」の案件はありません
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(byStage.get(activeStage) ?? []).map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={busyId === job.id}
              onAdvance={() => advanceStage(job)}
              onEdit={() => setEditJob(job)}
            />
          ))}
        </div>
      )}

      {/* 新規作成ダイアログ */}
      {createOpen && (
        <CreateDialog
          canAiNote={canAiNote}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => {
            setCreateOpen(false);
            showToast("success", "案件を作成しました");
            await fetchJobs();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 編集ダイアログ (ガイドライン準拠フィールドの記録) */}
      {editJob && (
        <EditDialog
          job={editJob}
          canAiQuote={canAiQuote}
          onClose={() => setEditJob(null)}
          onSaved={async () => {
            setEditJob(null);
            showToast("success", "案件を更新しました");
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
function JobCard({
  job,
  busy,
  onAdvance,
  onEdit,
}: {
  job: BodyRepairJob;
  busy: boolean;
  onAdvance: () => void;
  onEdit: () => void;
}) {
  const next = BODY_REPAIR_NEXT_STAGE[job.stage];
  const days = daysSince(job.intake_at);
  const amount = formatAmount(job.actual_amount ?? job.estimate_amount);
  const due = dueState(job);
  const dueChipCls =
    due === "overdue"
      ? "border-red-500/40 bg-red-500/15 text-red-300"
      : due === "today"
        ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
        : due === "soon"
          ? "border-blue-500/40 bg-blue-500/15 text-blue-300"
          : "border-border-subtle bg-inset text-muted";

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-primary">{job.customer?.name ?? "顧客未設定"}</div>
          <div className="mt-0.5 truncate text-xs text-secondary">{vehicleLabel(job.vehicle)}</div>
        </div>
        <MutationGuard>
          <button
            onClick={onEdit}
            className="shrink-0 rounded-md border border-border-subtle px-1.5 py-0.5 text-[10px] text-secondary transition-colors hover:bg-surface-hover hover:text-primary"
            aria-label="案件を編集"
          >
            編集
          </button>
        </MutationGuard>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${BODY_REPAIR_STAGE_COLOR[job.stage]}`}
        >
          {BODY_REPAIR_STAGE_LABEL[job.stage]}
        </span>
        {job.is_specified_maintenance && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
            特定整備
          </span>
        )}
        {amount && <span className="text-xs font-semibold text-accent">{amount}</span>}
        {job.due_date && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${dueChipCls}`}>
            納期 {formatDueLabel(job.due_date)}
            {due === "overdue" ? " ・超過" : due === "today" ? " ・本日" : due === "soon" ? " ・明日" : ""}
          </span>
        )}
        {job.estimate_document_id && (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
            見積書
          </span>
        )}
        {job.claim_status && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${claimChipCls(job.claim_status)}`}>
            保険:{CLAIM_STATUS_LABEL[job.claim_status as keyof typeof CLAIM_STATUS_LABEL] ?? job.claim_status}
          </span>
        )}
      </div>

      {job.insurance_company && <div className="mt-1 truncate text-[11px] text-muted">{job.insurance_company}</div>}
      {job.deviation_reason && (
        <div className="mt-1 truncate text-[11px] text-amber-400" title={job.deviation_reason}>
          予定と差異あり
        </div>
      )}

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
    </div>
  );
}

// ─── 新規作成ダイアログ ───
function CreateDialog({
  canAiNote,
  onClose,
  onCreated,
  onError,
}: {
  canAiNote: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  // 車両は顧客に紐づくため、顧客選択後にその顧客の車両を候補表示する。
  // 車両を紐付けておくと案件から AI 見積 (ai-from-vehicle) を作成できる。
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [estimateAmount, setEstimateAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [insuranceCompany, setInsuranceCompany] = useState("");
  const [claimNumber, setClaimNumber] = useState("");
  const [notes, setNotes] = useState("");
  // ガイドライン4.2(2): 作業前の予定内容と特定整備該当
  const [plannedMethods, setPlannedMethods] = useState("");
  const [plannedParts, setPlannedParts] = useState("");
  const [plannedPaint, setPlannedPaint] = useState("");
  const [isSpecified, setIsSpecified] = useState(false);
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

  // 顧客が決まったらその顧客の車両を取得。顧客変更時は車両選択をリセットする。
  useEffect(() => {
    setVehicleId("");
    setVehicles([]);
    if (!customerId) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/vehicles?customer_id=${customerId}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.vehicles ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setVehicles(
          list.map((v) => ({
            id: String(v.id),
            label:
              [v.maker, v.model, v.year ? String(v.year) : null, v.plate_display].filter(Boolean).join(" ") || "車両",
          })),
        );
      } catch {
        /* 取得失敗時は車両候補なし */
      }
    })();
    return () => {
      active = false;
    };
  }, [customerId]);

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
          vehicle_id: vehicleId || null,
          stage: "intake",
          estimate_amount: estimateAmount ? Number(estimateAmount) : null,
          due_date: dueDate || null,
          insurance_company: insuranceCompany.trim() || null,
          claim_number: claimNumber.trim() || null,
          notes: notes.trim() || null,
          is_specified_maintenance: isSpecified,
          planned_work: {
            methods: plannedMethods.trim() || undefined,
            parts: plannedParts.trim() || undefined,
            paint: plannedPaint.trim() || undefined,
          },
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

        {customerId && (
          <Field label="車両（任意・紐付けると AI 見積を作成できます）">
            {vehicles.length === 0 ? (
              <p className="text-xs text-muted">この顧客に登録車両がありません</p>
            ) : (
              <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={`w-full ${inputCls}`}>
                <option value="">（車両を指定しない）</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Field label="納期（完成予定日）">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        <Field label="予定する作業内容・方法（任意）">
          <textarea
            value={plannedMethods}
            onChange={(e) => setPlannedMethods(e.target.value)}
            rows={2}
            placeholder="例: ドアパネルの交換、エンジンフードの塗装"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="予定部品（任意）">
            <input
              value={plannedParts}
              onChange={(e) => setPlannedParts(e.target.value)}
              placeholder="例: 右ドアパネル(純正)"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="予定塗料（任意）">
            <input
              value={plannedPaint}
              onChange={(e) => setPlannedPaint(e.target.value)}
              placeholder="例: ○○ベースコート"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={isSpecified}
            onChange={(e) => setIsSpecified(e.target.checked)}
            className="h-4 w-4 rounded border-border-default accent-accent"
          />
          特定整備に該当する（記録簿を2年保存）
        </label>

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="損傷箇所・特記事項など"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
        {canAiNote && (
          <VoiceMemoPanel
            variant="note"
            serviceType="body_repair"
            onApply={(note) => setNotes((prev) => (prev.trim() ? `${prev.trim()}\n${note}` : note))}
          />
        )}
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="作成する" />
    </DialogShell>
  );
}

// ─── 編集ダイアログ (ガイドライン4.2(2)(3): 予定/実績・差異理由・実績料金) ───
const CASE_STATUS_LABEL: Record<string, string> = {
  open: "新規",
  in_progress: "処理中",
  pending_tenant: "返答待ち",
  resolved: "解決済",
  closed: "クローズ",
};
const SENDER_LABEL: Record<string, string> = { insurer: "保険会社", tenant: "自店", system: "システム" };

interface CaseMsg {
  id: string;
  sender_type: string;
  content: string;
  created_at: string;
}
interface CaseSummary {
  id: string;
  case_number: string | null;
  title: string | null;
  status: string;
}
interface InsurerCaseOption {
  id: string;
  case_number: string | null;
  title: string | null;
  status: string;
  insurer: { name: string | null } | null;
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 案件に紐づく保険案件 (insurer_cases) との往復メッセージを扱う (Phase 2D)。
 * 未リンクなら自社の保険案件を選んで紐付け、リンク済みならスレッド表示 +
 * 施工店としてメッセージ送信 (sender_type=tenant は API 側で固定)。
 */
function InsurerCaseSection({ job, onError }: { job: BodyRepairJob; onError: (msg: string) => void }) {
  const [caseId, setCaseId] = useState<string | null>(job.insurer_case_id);
  const [caseInfo, setCaseInfo] = useState<CaseSummary | null>(null);
  const [messages, setMessages] = useState<CaseMsg[]>([]);
  const [options, setOptions] = useState<InsurerCaseOption[]>([]);
  const [pick, setPick] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadThread = useCallback(async (cid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/insurer-cases/${cid}/messages`);
      const data = res.ok ? await res.json() : { case: null, messages: [] };
      setCaseInfo((data.case ?? null) as CaseSummary | null);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/insurer-cases");
      const data = res.ok ? await res.json() : { cases: [] };
      setOptions(Array.isArray(data.cases) ? data.cases : []);
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (caseId) loadThread(caseId);
    else loadOptions();
  }, [caseId, loadThread, loadOptions]);

  async function patchLink(value: string | null) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/body-repair-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, insurer_case_id: value }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "更新に失敗しました");
      }
      if (value) {
        setCaseId(value);
      } else {
        setCaseId(null);
        setCaseInfo(null);
        setMessages([]);
        setPick("");
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!caseId || !draft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/insurer-cases/${caseId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft.trim() }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "送信に失敗しました");
      }
      setDraft("");
      await loadThread(caseId);
    } catch (e) {
      onError(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-inset p-3">
      <div className="mb-1.5 text-xs font-semibold text-primary">保険会社とのやり取り</div>
      {loading ? (
        <p className="text-[11px] text-muted">読み込み中…</p>
      ) : caseId && caseInfo ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-secondary">{caseInfo.case_number ?? "案件"}</span>
            <span className="truncate text-xs text-primary">{caseInfo.title}</span>
            <span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] text-muted">
              {CASE_STATUS_LABEL[caseInfo.status] ?? caseInfo.status}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => patchLink(null)}
              className="ml-auto text-[10px] text-muted underline transition-colors hover:text-primary disabled:opacity-50"
            >
              紐付け解除
            </button>
          </div>
          <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-border-subtle bg-surface p-2">
            {messages.length === 0 ? (
              <p className="text-[11px] text-muted">まだメッセージはありません</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={m.sender_type === "tenant" ? "text-right" : "text-left"}>
                  <div className="text-[9.5px] text-muted">
                    {SENDER_LABEL[m.sender_type] ?? m.sender_type} · {formatMsgTime(m.created_at)}
                  </div>
                  <div
                    className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-2 py-1 text-left text-[11px] ${
                      m.sender_type === "tenant" ? "bg-accent/15 text-primary" : "bg-inset text-secondary"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder="保険会社へのメッセージ（見積提出・確認依頼など）"
              className={`w-full resize-none ${inputCls}`}
            />
            <MutationGuard>
              <button
                type="button"
                disabled={busy || !draft.trim()}
                onClick={send}
                className="shrink-0 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {busy ? "…" : "送信"}
              </button>
            </MutationGuard>
          </div>
        </div>
      ) : options.length === 0 ? (
        <p className="text-[11px] text-muted">紐付け可能な保険案件がありません</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className={inputCls}>
            <option value="">保険案件を選択</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.case_number, c.insurer?.name, c.title].filter(Boolean).join(" / ")}
              </option>
            ))}
          </select>
          <MutationGuard>
            <button
              type="button"
              disabled={busy || !pick}
              onClick={() => patchLink(pick)}
              className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? "…" : "この案件に紐付け"}
            </button>
          </MutationGuard>
        </div>
      )}
    </div>
  );
}

interface ActiveLoan {
  id: string;
  return_due_at: string | null;
  loaner_car: { name: string | null; plate_display: string | null } | null;
}

function formatLoanDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 案件に紐付く代車の貸出/返却を扱う。アクティブな貸出があれば代車名・返却予定
 * (超過は赤) と「返却する」を表示し、無ければ貸出可能な代車を選んで貸し出す。
 * loaner_car_loans.body_repair_job_id 経由で案件と紐付ける (Phase 2B)。
 */
function LoanerSection({ job, onError }: { job: BodyRepairJob; onError: (msg: string) => void }) {
  const [loan, setLoan] = useState<ActiveLoan | null>(null);
  const [cars, setCars] = useState<VehicleOption[]>([]);
  const [carId, setCarId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/loaner-cars/loans?body_repair_job_id=${job.id}&active_only=true`);
      const data = res.ok ? await res.json() : { loans: [] };
      const active = (Array.isArray(data.loans) && data.loans.length > 0 ? data.loans[0] : null) as ActiveLoan | null;
      setLoan(active);
      if (!active) {
        const carsRes = await fetch("/api/admin/loaner-cars");
        const carsData = carsRes.ok ? await carsRes.json() : { cars: [] };
        const list = ((carsData.cars ?? []) as Array<Record<string, unknown>>).filter(
          (c) => c.is_active && !c.current_loan,
        );
        setCars(
          list.map((c) => ({
            id: String(c.id),
            label: [c.name, c.plate_display].filter(Boolean).join(" / ") || "代車",
          })),
        );
      }
    } catch {
      /* 取得失敗時は何も表示しない */
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function lend() {
    if (!carId) {
      onError("代車を選択してください。");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/loaner-cars/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loaner_car_id: carId,
          customer_id: job.customer_id ?? undefined,
          body_repair_job_id: job.id,
          return_due_at: dueAt || undefined,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "貸出に失敗しました");
      }
      setCarId("");
      setDueAt("");
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "貸出に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function returnCar() {
    if (!loan) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/loaner-cars/loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loan.id }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message ?? "返却に失敗しました");
      }
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "返却に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  const overdue = loan?.return_due_at ? new Date(loan.return_due_at).getTime() < Date.now() : false;

  return (
    <div className="rounded-lg border border-border-subtle bg-inset p-3">
      <div className="mb-1.5 text-xs font-semibold text-primary">代車</div>
      {loading ? (
        <p className="text-[11px] text-muted">読み込み中…</p>
      ) : loan ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-primary">
            {loan.loaner_car
              ? [loan.loaner_car.name, loan.loaner_car.plate_display].filter(Boolean).join(" / ")
              : "代車"}
          </span>
          {loan.return_due_at && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                overdue ? "border-red-500/40 bg-red-500/15 text-red-300" : "border-border-subtle bg-surface text-muted"
              }`}
            >
              返却予定 {formatLoanDue(loan.return_due_at)}
              {overdue ? " ・超過" : ""}
            </span>
          )}
          <MutationGuard>
            <button
              type="button"
              disabled={busy}
              onClick={returnCar}
              className="rounded-md border border-border-strong px-2.5 py-1 text-[11px] text-secondary transition-colors hover:text-primary disabled:opacity-50"
            >
              {busy ? "…" : "返却する"}
            </button>
          </MutationGuard>
        </div>
      ) : cars.length === 0 ? (
        <p className="text-[11px] text-muted">貸出可能な代車がありません</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <select value={carId} onChange={(e) => setCarId(e.target.value)} className={inputCls}>
            <option value="">代車を選択</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className={inputCls}
            aria-label="返却予定日"
          />
          <MutationGuard>
            <button
              type="button"
              disabled={busy || !carId}
              onClick={lend}
              className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {busy ? "…" : "貸し出す"}
            </button>
          </MutationGuard>
        </div>
      )}
    </div>
  );
}

function EditDialog({
  job,
  canAiQuote,
  onClose,
  onSaved,
  onError,
}: {
  job: BodyRepairJob;
  canAiQuote: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const planned = job.planned_work_json ?? {};
  const actual = job.actual_work_json ?? {};
  const [actualMethods, setActualMethods] = useState(actual.methods ?? "");
  const [actualParts, setActualParts] = useState(actual.parts ?? "");
  const [actualPaint, setActualPaint] = useState(actual.paint ?? "");
  const [deviationReason, setDeviationReason] = useState(job.deviation_reason ?? "");
  const [actualAmount, setActualAmount] = useState(job.actual_amount != null ? String(job.actual_amount) : "");
  const [dueDate, setDueDate] = useState(job.due_date ?? "");
  const [claimStatus, setClaimStatus] = useState(job.claim_status ?? "");
  const [claimApproved, setClaimApproved] = useState(
    job.claim_approved_amount != null ? String(job.claim_approved_amount) : "",
  );
  const [claimDecidedAt, setClaimDecidedAt] = useState(job.claim_decided_at ? job.claim_decided_at.slice(0, 10) : "");
  const [isSpecified, setIsSpecified] = useState(job.is_specified_maintenance);
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  /**
   * AI 見積を作成して案件に添付する。
   * ai-from-vehicle で下書き生成 → documents に見積書を作成 → 案件へ
   * estimate_document_id / estimate_amount を紐付け、の 3 ステップを順に実行する。
   */
  async function createAiEstimate() {
    if (!job.vehicle_id) {
      onError("AI 見積には車両の紐付けが必要です。");
      return;
    }
    setAiBusy(true);
    try {
      // 1) AI 見積下書き
      const aiRes = await fetch("/api/admin/quotes/ai-from-vehicle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_id: job.vehicle_id,
          customer_id: job.customer_id ?? undefined,
          service_category: "板金塗装",
        }),
      });
      if (!aiRes.ok) {
        const err = await aiRes.json().catch(() => ({}));
        throw new Error(err.message ?? "AI 見積の生成に失敗しました");
      }
      const aiData = await aiRes.json();
      if (aiData.ai_disabled || !aiData.draft) {
        throw new Error("AI 自動化が無効です（設定から有効化してください）");
      }
      const draft = aiData.draft as {
        items: Array<{ description: string; quantity: number; unit_price: number }>;
        total: number;
        terms?: string;
      };

      // 2) 見積書 (documents.doc_type='estimate') を作成
      const items = draft.items.map((i) => ({
        item_type: "item",
        description: i.description,
        quantity: i.quantity,
        unit_price: i.unit_price,
      }));
      const docRes = await fetch("/api/admin/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: "estimate",
          customer_id: job.customer_id ?? null,
          subject: "お見積書（鈑金塗装）",
          items,
          note: draft.terms ?? null,
          status: "draft",
          tax_rate: 10,
        }),
      });
      if (!docRes.ok) {
        const err = await docRes.json().catch(() => ({}));
        throw new Error(err.message ?? "見積書の作成に失敗しました");
      }
      const doc = (await docRes.json()).document as { id: string; total: number };

      // 3) 案件へ紐付け（見積金額も同期）
      const patchRes = await fetch("/api/admin/body-repair-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, estimate_document_id: doc.id, estimate_amount: doc.total }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.message ?? "案件への紐付けに失敗しました");
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "AI 見積の作成に失敗しました");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    if (actualAmount && (!Number.isInteger(Number(actualAmount)) || Number(actualAmount) < 0)) {
      onError("実績金額は 0 以上の整数で入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/body-repair-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: job.id,
          actual_amount: actualAmount ? Number(actualAmount) : null,
          due_date: dueDate || null,
          claim_status: claimStatus || null,
          claim_approved_amount: claimApproved ? Number(claimApproved) : null,
          claim_decided_at: claimDecidedAt || null,
          deviation_reason: deviationReason.trim() || null,
          is_specified_maintenance: isSpecified,
          actual_work: {
            methods: actualMethods.trim() || undefined,
            parts: actualParts.trim() || undefined,
            paint: actualPaint.trim() || undefined,
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "update failed");
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title="作業実績の記録" onClose={onClose}>
      <div className="space-y-4">
        {/* AI 見積 */}
        <div className="rounded-lg border border-border-subtle bg-inset p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-primary">AI 見積</span>
            {job.estimate_document_id && (
              <a
                href={`/admin/documents/${job.estimate_document_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-accent/20"
              >
                見積書を開く →
              </a>
            )}
          </div>
          {canAiQuote ? (
            <div className="flex flex-wrap items-center gap-2">
              <MutationGuard>
                <button
                  type="button"
                  disabled={aiBusy || !job.vehicle_id}
                  onClick={createAiEstimate}
                  className="rounded-md bg-accent px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  {aiBusy ? "作成中…" : job.estimate_document_id ? "AIで見積書を作り直す" : "AIで見積書を作成"}
                </button>
              </MutationGuard>
              {!job.vehicle_id && <span className="text-[11px] text-muted">※ 車両が紐付いた案件で利用できます</span>}
            </div>
          ) : (
            <p className="text-[11px] text-muted">AI 見積は Standard プラン以上でご利用いただけます。</p>
          )}
        </div>

        {/* 代車 */}
        <LoanerSection job={job} onError={onError} />

        {/* 保険会社とのやり取り */}
        <InsurerCaseSection job={job} onError={onError} />

        {/* 予定内容 (読み取り専用) */}
        <div className="rounded-lg border border-border-subtle bg-inset p-3 text-xs text-secondary">
          <div className="mb-1 font-semibold text-primary">予定（作業開始前）</div>
          <PlannedRow label="作業内容・方法" value={planned.methods} />
          <PlannedRow label="部品" value={planned.parts} />
          <PlannedRow label="塗料" value={planned.paint} />
        </div>

        <Field label="実際に行った作業内容・方法">
          <textarea
            value={actualMethods}
            onChange={(e) => setActualMethods(e.target.value)}
            rows={2}
            placeholder="実施した板金・塗装・交換の内容"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="実際に使用した部品">
            <input
              value={actualParts}
              onChange={(e) => setActualParts(e.target.value)}
              placeholder="例: 右ドアパネル(純正)"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="実際に使用した塗料">
            <input
              value={actualPaint}
              onChange={(e) => setActualPaint(e.target.value)}
              placeholder="例: ○○ベースコート"
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        <Field label="予定と異なる場合の理由">
          <textarea
            value={deviationReason}
            onChange={(e) => setDeviationReason(e.target.value)}
            rows={2}
            placeholder="予定と実績に差異が生じた理由を記録（消費者等への説明にも使用）"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="実績金額（円）">
            <input
              type="number"
              min={0}
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="例: 185000"
              className={`w-full ${inputCls}`}
            />
          </Field>
          <Field label="納期（完成予定日）">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </Field>
        </div>

        {/* 保険査定 (保険会社から受領した結果の記録) */}
        <div className="rounded-lg border border-border-subtle bg-inset p-3">
          <div className="mb-2 text-xs font-semibold text-primary">保険査定（受領結果）</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="ステータス">
              <select
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value)}
                className={`w-full ${inputCls}`}
              >
                <option value="">未提出</option>
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CLAIM_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="承認額（円）">
              <input
                type="number"
                min={0}
                value={claimApproved}
                onChange={(e) => setClaimApproved(e.target.value)}
                placeholder="例: 175000"
                className={`w-full ${inputCls}`}
              />
            </Field>
            <Field label="査定受領日">
              <input
                type="date"
                value={claimDecidedAt}
                onChange={(e) => setClaimDecidedAt(e.target.value)}
                className={`w-full ${inputCls}`}
              />
            </Field>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-secondary">
          <input
            type="checkbox"
            checked={isSpecified}
            onChange={(e) => setIsSpecified(e.target.checked)}
            className="h-4 w-4 rounded border-border-default accent-accent"
          />
          特定整備に該当する（記録簿を2年保存）
        </label>

        {job.record_retention_until && (
          <p className="text-[11px] text-muted">記録保存期限: {job.record_retention_until}</p>
        )}

        <ConsentShareActions jobId={job.id} onError={onError} />
      </div>

      <DialogActions onClose={onClose} onSubmit={save} submitting={submitting} submitLabel="保存する" />
    </DialogShell>
  );
}

// ─── 顧客への同意依頼・進捗共有リンク発行 (ガイドライン4.2(5)/4.3) ───
function ConsentShareActions({ jobId, onError }: { jobId: string; onError: (msg: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);

  // 相対パスのみ現在のオリジンを付与する。NEXT_PUBLIC_SIGN_BASE_URL が絶対 URL の
  // 場合 sign_url は既に絶対なので二重連結しない。
  const absolute = (path: string) => {
    if (/^https?:\/\//.test(path)) return path;
    return typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  };

  const run = useCallback(
    async (action: string, label: string, url: string, body?: Record<string, unknown>) => {
      setBusy(action);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.message ?? "発行に失敗しました");
        const path = (json.sign_url ?? json.track_url) as string;
        setLinks((prev) => [{ label, url: absolute(path) }, ...prev.filter((l) => l.label !== label)]);
      } catch (e) {
        onError(e instanceof Error ? e.message : "発行に失敗しました");
      } finally {
        setBusy(null);
      }
    },
    [onError],
  );

  return (
    <div className="rounded-lg border border-border-subtle bg-inset p-3">
      <div className="mb-2 text-xs font-semibold text-primary">顧客への同意・共有</div>
      <div className="flex flex-wrap gap-2">
        <MutationGuard>
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              run("pre_work", "作業前同意", `/api/admin/body-repair-jobs/${jobId}/consent-request`, {
                kind: "pre_work",
              })
            }
            className="rounded-md border border-border-default px-2.5 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {busy === "pre_work" ? "…" : "作業前同意を依頼"}
          </button>
        </MutationGuard>
        <MutationGuard>
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              run("change", "変更同意", `/api/admin/body-repair-jobs/${jobId}/consent-request`, { kind: "change" })
            }
            className="rounded-md border border-border-default px-2.5 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {busy === "change" ? "…" : "変更同意を依頼"}
          </button>
        </MutationGuard>
        <MutationGuard>
          <button
            type="button"
            disabled={busy != null}
            onClick={() => run("track", "進捗リンク", `/api/admin/body-repair-jobs/${jobId}/track-link`)}
            className="rounded-md border border-border-default px-2.5 py-1 text-xs text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            {busy === "track" ? "…" : "進捗リンクを発行"}
          </button>
        </MutationGuard>
      </div>
      {links.length > 0 && (
        <div className="mt-2 space-y-1">
          {links.map((l) => (
            <div key={l.label} className="flex items-center gap-2 text-[11px]">
              <span className="shrink-0 text-muted">{l.label}:</span>
              <input
                readOnly
                value={l.url}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-secondary"
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(l.url)}
                className="shrink-0 rounded bg-accent px-2 py-0.5 text-white"
              >
                コピー
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannedRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="shrink-0 text-muted">{label}:</span>
      <span className="truncate text-secondary">{value || "—"}</span>
    </div>
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
