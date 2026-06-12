"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

// ─── 型定義 ──────────────────────────────────────────────────────
type ContactType = "call" | "visit" | "email" | "sms" | "line";
type ContactStatus = "pending" | "completed" | "skipped" | "rescheduled";
type ContactResult = "success" | "no_answer" | "declined" | "rescheduled" | "converted";

interface ScheduleCustomer {
  id: string;
  name: string;
  phone: string | null;
}
interface ScheduleVehicle {
  id: string;
  label: string;
  plate: string | null;
}
interface ContactSchedule {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  assigned_user_id: string | null;
  contact_type: ContactType;
  scheduled_at: string;
  status: ContactStatus;
  result: ContactResult | null;
  notes: string | null;
  completed_at: string | null;
  customer: ScheduleCustomer | null;
  vehicle: ScheduleVehicle | null;
}

type TabKey = "today" | "week" | "future";

// ─── 表示メタ ─────────────────────────────────────────────────────
const TYPE_META: Record<ContactType, { icon: string; label: string }> = {
  call: { icon: "📞", label: "架電" },
  visit: { icon: "🚗", label: "訪問" },
  email: { icon: "✉️", label: "メール" },
  sms: { icon: "💬", label: "SMS" },
  line: { icon: "💚", label: "LINE" },
};

const STATUS_META: Record<ContactStatus, { label: string; cls: string }> = {
  pending: { label: "予定", cls: "bg-accent-dim text-accent-text" },
  completed: { label: "完了", cls: "bg-success-dim text-success-text" },
  skipped: { label: "スキップ", cls: "bg-inset text-muted" },
  rescheduled: { label: "リスケ", cls: "bg-warning-dim text-warning-text" },
};

const RESULT_LABELS: Record<ContactResult, string> = {
  success: "成功",
  no_answer: "不在",
  declined: "辞退",
  rescheduled: "再調整",
  converted: "成約",
};

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";
const selectCls = inputCls;

// ─── ユーティリティ ───────────────────────────────────────────────
function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
/** datetime-local input 用の現在時刻文字列 (秒なし) */
function nowLocalInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function ContactSchedulesClient() {
  const [schedules, setSchedules] = useState<ContactSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // どのカードで結果ドロップダウンを開いているか
  const [resultEditId, setResultEditId] = useState<string | null>(null);

  function showToast(type: "success" | "error", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }

  // ─── データ取得: 今日〜30日先まで一括取得しクライアント側でタブ振り分け ───
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const from = ymd(startOfToday());
      const to = new Date(startOfToday());
      to.setDate(to.getDate() + 30);
      const params = new URLSearchParams({ status: "all", from, to: ymd(to) });
      const res = await fetch(`/api/admin/contact-schedules?${params.toString()}`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
    } catch (e) {
      console.error(e);
      showToast("error", "スケジュールの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // ─── タブごとの絞り込み ───
  const grouped = useMemo(() => {
    const today = startOfToday();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const inRange = (iso: string, lo: Date, hi: Date) => {
      const t = new Date(iso).getTime();
      return t >= lo.getTime() && t < hi.getTime();
    };

    const todayList = schedules.filter((s) => inRange(s.scheduled_at, today, tomorrow));
    const weekList = schedules.filter((s) => inRange(s.scheduled_at, today, weekEnd));
    const futureList = schedules.filter((s) => new Date(s.scheduled_at).getTime() >= weekEnd.getTime());
    return { today: todayList, week: weekList, future: futureList };
  }, [schedules]);

  const visibleList = grouped[activeTab];

  // ─── 作成 ───
  async function handleCreate(payload: {
    customer_id: string | null;
    vehicle_id: string | null;
    contact_type: ContactType;
    scheduled_at: string;
    notes: string | null;
  }) {
    try {
      const res = await fetch("/api/admin/contact-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      showToast("success", "コンタクト予定を追加しました");
      setDialogOpen(false);
      await fetchSchedules();
    } catch (e) {
      console.error(e);
      showToast("error", e instanceof Error ? e.message : "追加に失敗しました");
    }
  }

  // ─── 状態更新 (完了 / スキップ / リスケ) ───
  async function patchSchedule(
    id: string,
    body: { status?: ContactStatus; result?: ContactResult | null },
  ) {
    setBusyId(id);
    try {
      const res = await fetch("/api/admin/contact-schedules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "update failed");
      }
      const data = await res.json();
      const updated: ContactSchedule = data.schedule;
      // 取得済みリストを差し替え (顧客/車両情報は API が返さないため既存値を温存)
      setSchedules((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updated, customer: s.customer, vehicle: s.vehicle } : s)),
      );
      setResultEditId(null);
      showToast("success", "更新しました");
    } catch (e) {
      console.error(e);
      showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このコンタクト予定を削除しますか？")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/contact-schedules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      setSchedules((prev) => prev.filter((s) => s.id !== id));
      showToast("success", "削除しました");
    } catch (e) {
      console.error(e);
      showToast("error", "削除に失敗しました");
    } finally {
      setBusyId(null);
    }
  }

  const TAB_META: Record<TabKey, { label: string; count: number }> = {
    today: { label: "今日", count: grouped.today.length },
    week: { label: "今週", count: grouped.week.length },
    future: { label: "今後", count: grouped.future.length },
  };

  // ─── レンダリング ─────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto pb-20">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-primary">コンタクトスケジュール</h1>
          <p className="text-sm text-secondary mt-1">架電・訪問・フォローの予定と実績を管理します</p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="flex items-center gap-2 px-5 py-2 bg-accent text-white rounded-lg font-medium hover:bg-accent/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          架電予定を追加
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b border-border-default mb-6">
        {(["today", "week", "future"] as TabKey[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-accent text-accent" : "border-transparent text-secondary hover:text-primary"
            }`}
          >
            {TAB_META[tab].label}
            <span className="ml-1.5 text-xs text-muted">({TAB_META[tab].count})</span>
          </button>
        ))}
      </div>

      {/* 一覧 */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[240px]">
          <div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleList.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">この期間のコンタクト予定はありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleList.map((s) => {
            const type = TYPE_META[s.contact_type];
            const statusMeta = STATUS_META[s.status];
            const isBusy = busyId === s.id;
            const isPending = s.status === "pending";
            return (
              <div key={s.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start gap-3">
                  {/* 種別アイコン */}
                  <div className="w-11 h-11 rounded-lg bg-inset flex items-center justify-center text-xl shrink-0">
                    <span aria-hidden>{type.icon}</span>
                  </div>

                  {/* 本文 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-primary truncate">
                        {s.customer?.name ?? "（顧客未設定）"}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusMeta.cls}`}>
                        {statusMeta.label}
                      </span>
                      {s.result && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-inset text-secondary">
                          {RESULT_LABELS[s.result]}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-secondary mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-muted">{type.label}</span>
                      <span className="text-muted">·</span>
                      <span>{formatDateTime(s.scheduled_at)}</span>
                      {s.customer?.phone && (
                        <>
                          <span className="text-muted">·</span>
                          <span className="text-muted">{s.customer.phone}</span>
                        </>
                      )}
                    </div>
                    {s.vehicle && (
                      <div className="text-xs text-muted mt-0.5">
                        {s.vehicle.label}
                        {s.vehicle.plate ? ` / ${s.vehicle.plate}` : ""}
                      </div>
                    )}
                    {s.notes && <p className="text-sm text-secondary mt-2 whitespace-pre-wrap">{s.notes}</p>}

                    {/* アクション */}
                    {isPending && (
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {resultEditId === s.id ? (
                          <ResultSelect
                            disabled={isBusy}
                            onConfirm={(result) => patchSchedule(s.id, { status: "completed", result })}
                            onCancel={() => setResultEditId(null)}
                          />
                        ) : (
                          <>
                            <button
                              disabled={isBusy}
                              onClick={() => setResultEditId(s.id)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success text-white hover:bg-success/90 disabled:opacity-50 transition-colors"
                            >
                              完了
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => patchSchedule(s.id, { status: "skipped" })}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-inset text-secondary hover:bg-surface-active disabled:opacity-50 transition-colors"
                            >
                              スキップ
                            </button>
                            <button
                              disabled={isBusy}
                              onClick={() => patchSchedule(s.id, { status: "rescheduled", result: "rescheduled" })}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-warning-dim text-warning-text hover:opacity-90 disabled:opacity-50 transition-colors"
                            >
                              リスケ
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 削除 */}
                  <button
                    disabled={isBusy}
                    onClick={() => handleDelete(s.id)}
                    className="text-muted hover:text-danger transition-colors shrink-0 disabled:opacity-50"
                    title="削除"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 追加ダイアログ */}
      {dialogOpen && <AddDialog onClose={() => setDialogOpen(false)} onCreate={handleCreate} />}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 z-50 ${
            toast.type === "success" ? "bg-accent text-white" : "bg-danger text-white"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── 結果選択 (完了時) ───
function ResultSelect({
  disabled,
  onConfirm,
  onCancel,
}: {
  disabled: boolean;
  onConfirm: (result: ContactResult) => void;
  onCancel: () => void;
}) {
  const [result, setResult] = useState<ContactResult>("success");
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={result}
        onChange={(e) => setResult(e.target.value as ContactResult)}
        disabled={disabled}
        className={selectCls}
      >
        {(Object.keys(RESULT_LABELS) as ContactResult[]).map((r) => (
          <option key={r} value={r}>
            {RESULT_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        disabled={disabled}
        onClick={() => onConfirm(result)}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success text-white hover:bg-success/90 disabled:opacity-50 transition-colors"
      >
        確定
      </button>
      <button
        disabled={disabled}
        onClick={onCancel}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-inset text-secondary hover:bg-surface-active disabled:opacity-50 transition-colors"
      >
        取消
      </button>
    </div>
  );
}

// ─── 追加ダイアログ ───
interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
}

function AddDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (payload: {
    customer_id: string | null;
    vehicle_id: string | null;
    contact_type: ContactType;
    scheduled_at: string;
    notes: string | null;
  }) => void;
}) {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [contactType, setContactType] = useState<ContactType>("call");
  const [scheduledAt, setScheduledAt] = useState<string>(nowLocalInput());
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/customers?per_page=200");
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
        /* 顧客リストはオプショナル — 取得失敗時は空のまま */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function submit() {
    if (!scheduledAt) return;
    setSubmitting(true);
    // datetime-local はローカル時刻なので Date 経由で ISO(UTC) に変換
    const iso = new Date(scheduledAt).toISOString();
    onCreate({
      customer_id: customerId || null,
      vehicle_id: null,
      contact_type: contactType,
      scheduled_at: iso,
      notes: notes.trim() || null,
    });
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="glass-card w-full max-w-md rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-primary">コンタクト予定を追加</h2>
          <button onClick={onClose} className="text-muted hover:text-primary" aria-label="閉じる">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* 顧客 */}
          <div>
            <label className="block text-xs text-secondary mb-1">顧客</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`w-full ${selectCls}`}>
              <option value="">（顧客なし）</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` (${c.phone})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* 種別 */}
          <div>
            <label className="block text-xs text-secondary mb-1">連絡種別</label>
            <div className="flex gap-2 flex-wrap">
              {(Object.keys(TYPE_META) as ContactType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setContactType(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors flex items-center gap-1.5 ${
                    contactType === t
                      ? "border-accent bg-accent-dim text-accent-text"
                      : "border-border-default text-secondary hover:bg-surface-hover"
                  }`}
                >
                  <span aria-hidden>{TYPE_META[t].icon}</span>
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* 予定日時 */}
          <div>
            <label className="block text-xs text-secondary mb-1">予定日時</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={`w-full ${inputCls}`}
            />
          </div>

          {/* メモ */}
          <div>
            <label className="block text-xs text-secondary mb-1">メモ（任意）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="例: 有効期限のご案内、点検のご提案"
              className={`w-full resize-none ${inputCls}`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-inset text-secondary hover:bg-surface-active transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={submit}
            disabled={submitting || !scheduledAt}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}
