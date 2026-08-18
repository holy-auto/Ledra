"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import {
  SERVICE_REMINDER_TYPES,
  SERVICE_REMINDER_TYPE_LABEL,
  type ServiceReminderType,
} from "@/lib/validations/service-reminder";

// ─── 型定義 ──────────────────────────────────────────────────────
interface JoinedCustomer {
  id: string;
  name: string;
}
interface JoinedVehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
}
interface Reminder {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_name: string;
  reminder_type: ServiceReminderType;
  last_service_mileage: number | null;
  recommended_interval_km: number | null;
  last_service_date: string | null;
  recommended_interval_months: number | null;
  next_due_mileage: number | null;
  next_due_date: string | null;
  status: "active" | "snoozed" | "completed" | "cancelled";
  notified_at: string | null;
  completed_at: string | null;
  notes: string | null;
  customer: JoinedCustomer | null;
  vehicle: JoinedVehicle | null;
  current_mileage: number | null;
  km_remaining: number | null;
  is_due_soon: boolean;
  is_overdue: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
}
interface VehicleOption {
  id: string;
  label: string;
  customer_id: string | null;
}

type TabKey = "all" | "due" | "overdue";

const inputCls =
  "text-sm border border-border-default rounded-md px-2.5 py-1.5 bg-surface text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent";

// ─── ユーティリティ ───────────────────────────────────────────────
function vehicleLabel(v: JoinedVehicle | null): string {
  if (!v) return "車両未設定";
  const base = [v.maker, v.model].filter(Boolean).join(" ") || "車両";
  return v.plate_display ? `${base} / ${v.plate_display}` : base;
}

function formatYearMonth(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

/** 次回推奨の表示文字列 (走行距離 / 期間 の両方を考慮)。 */
function nextDueText(r: Reminder): string[] {
  const parts: string[] = [];
  if (r.reminder_type !== "interval_months" && r.next_due_mileage != null) {
    if (r.km_remaining != null) {
      parts.push(
        r.km_remaining > 0
          ? `走行距離ベース: あと ${r.km_remaining.toLocaleString("ja-JP")}km`
          : `走行距離ベース: ${Math.abs(r.km_remaining).toLocaleString("ja-JP")}km 超過`,
      );
    } else {
      parts.push(`走行距離ベース: ${r.next_due_mileage.toLocaleString("ja-JP")}km 到達時`);
    }
  }
  if (r.reminder_type !== "mileage" && r.next_due_date != null) {
    parts.push(`期間ベース: ${formatYearMonth(r.next_due_date)}`);
  }
  return parts.length > 0 ? parts : ["推奨時期: 未算出"];
}

/** ステータスバッジのメタ (緑=余裕 / オレンジ=まもなく / 赤=超過)。 */
function statusBadge(r: Reminder): { label: string; cls: string } {
  if (r.is_overdue) return { label: "超過", cls: "bg-danger-dim text-danger-text" };
  if (r.is_due_soon) return { label: "まもなく", cls: "bg-warning-dim text-warning-text" };
  return { label: "余裕あり", cls: "bg-success-dim text-success-text" };
}

// ─── メインコンポーネント ─────────────────────────────────────────
export default function ServiceRemindersClient() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<Reminder | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const showToast = useCallback((type: "success" | "error", msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // すべての active を取得してクライアント側でタブ振り分けする (件数も同時に出すため)。
  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/service-reminders?status=active");
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
    } catch (e) {
      console.error(e);
      showToast("error", "リマインダーの読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const grouped = useMemo(() => {
    const due = reminders.filter((r) => r.is_due_soon && !r.is_overdue);
    const overdue = reminders.filter((r) => r.is_overdue);
    return { all: reminders, due, overdue };
  }, [reminders]);

  const visible = grouped[activeTab];

  const handleNotified = useCallback(
    async (r: Reminder) => {
      setBusyId(r.id);
      try {
        const res = await fetch("/api/admin/service-reminders", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.id, mark_notified: true }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message ?? "update failed");
        }
        const data = await res.json();
        const updated: Reminder = { ...r, ...data.reminder, customer: r.customer, vehicle: r.vehicle };
        setReminders((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
        showToast("success", "通知済みにしました");
      } catch (e) {
        showToast("error", e instanceof Error ? e.message : "更新に失敗しました");
      } finally {
        setBusyId(null);
      }
    },
    [showToast],
  );

  const TAB_META: Record<TabKey, { label: string; count: number }> = {
    all: { label: "全件", count: grouped.all.length },
    due: { label: "まもなく期限", count: grouped.due.length },
    overdue: { label: "超過", count: grouped.overdue.length },
  };

  return (
    <div className="mx-auto max-w-4xl pb-20">
      {/* ヘッダー + タブ（L字シェルのページバー） */}
      <div className="mb-6">
        <PageHeader
          tag="整備提案"
          title="整備提案・交換管理"
          description="走行距離・前回施工日から交換推奨時期を算出し、後日整備を提案します"
          actions={
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent/90"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              提案を追加
            </button>
          }
          tabs={(["all", "due", "overdue"] as TabKey[]).map((tab) => ({
            key: tab,
            label: TAB_META[tab].label,
            badge: TAB_META[tab].count,
          }))}
          activeTab={activeTab}
          onTabSelect={(k) => setActiveTab(k as TabKey)}
        />
      </div>

      {/* リスト */}
      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-xl p-10 text-center text-muted">
          <p className="text-sm">
            {activeTab === "all"
              ? "整備提案がまだありません。「提案を追加」から登録してください。"
              : "該当する提案はありません。"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const badge = statusBadge(r);
            const isBusy = busyId === r.id;
            return (
              <div key={r.id} className="glass-card rounded-xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-primary">{vehicleLabel(r.vehicle)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                      {r.notified_at && (
                        <span className="rounded-full bg-inset px-2 py-0.5 text-xs text-muted">通知済</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-secondary">
                      {r.customer?.name ?? "顧客未設定"}
                      <span className="mx-1.5 text-muted">·</span>
                      <span className="text-muted">{SERVICE_REMINDER_TYPE_LABEL[r.reminder_type]}</span>
                    </div>

                    <div className="mt-2 font-medium text-primary">{r.service_name}</div>
                    <div className="mt-1 space-y-0.5">
                      {nextDueText(r).map((line, i) => (
                        <div key={i} className="text-sm text-secondary">
                          {line}
                        </div>
                      ))}
                    </div>
                    {r.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{r.notes}</p>}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
                  <button
                    disabled={isBusy}
                    onClick={() => setCompleteTarget(r)}
                    className="rounded-lg bg-success px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                  >
                    完了登録
                  </button>
                  <button
                    disabled={isBusy || !!r.notified_at}
                    onClick={() => handleNotified(r)}
                    className="rounded-lg bg-inset px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-surface-active disabled:opacity-50"
                  >
                    {r.notified_at ? "通知済み" : "通知済みにする"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 新規追加ダイアログ */}
      {addOpen && (
        <AddDialog
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            setAddOpen(false);
            showToast("success", "整備提案を追加しました");
            await fetchReminders();
          }}
          onError={(msg) => showToast("error", msg)}
        />
      )}

      {/* 完了登録ダイアログ (完了 + 新規リマインダー再設定) */}
      {completeTarget && (
        <CompleteDialog
          reminder={completeTarget}
          onClose={() => setCompleteTarget(null)}
          onDone={async () => {
            setCompleteTarget(null);
            showToast("success", "完了登録しました");
            await fetchReminders();
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

// ─── 顧客・車両セレクタ (共通) ───
function useCustomerVehicleSelect() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/customers?per_page=200");
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.customers ?? data.items ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        setCustomers(list.map((c) => ({ id: String(c.id), name: String(c.name ?? "") })));
      } catch {
        /* オプショナル */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // 顧客が選ばれたらその顧客の車両に絞り込み。未選択なら全車両。
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const params = new URLSearchParams({ per_page: "200" });
        if (customerId) params.set("customer_id", customerId);
        const res = await fetch(`/api/admin/vehicles?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.vehicles ?? []) as Array<Record<string, unknown>>;
        if (!active) return;
        const opts = list.map((v) => {
          const base = [v.maker, v.model].filter(Boolean).join(" ") || "車両";
          const plate = v.plate_display ? ` / ${String(v.plate_display)}` : "";
          return {
            id: String(v.id),
            label: `${base}${plate}`,
            customer_id: v.customer_id ? String(v.customer_id) : null,
          };
        });
        setVehicles(opts);
        // 顧客を変えて車両リストが入れ替わったら、選択中の車両が新リストに
        // 無ければクリアする (関数更新でこの effect は vehicleId に依存しない)。
        const validIds = new Set(opts.map((o) => o.id));
        setVehicleId((cur) => (cur && !validIds.has(cur) ? "" : cur));
      } catch {
        /* オプショナル */
      }
    })();
    return () => {
      active = false;
    };
  }, [customerId]);

  return { customers, vehicles, customerId, setCustomerId, vehicleId, setVehicleId };
}

// ─── 新規追加ダイアログ ───
function AddDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const { customers, vehicles, customerId, setCustomerId, vehicleId, setVehicleId } = useCustomerVehicleSelect();
  const [serviceName, setServiceName] = useState("");
  const [reminderType, setReminderType] = useState<ServiceReminderType>("mileage");
  const [lastMileage, setLastMileage] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [lastDate, setLastDate] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!serviceName.trim()) {
      onError("サービス名を入力してください。");
      return;
    }
    if (reminderType !== "interval_months" && !intervalKm) {
      onError("走行距離ベースの提案には推奨交換距離 (km) を入力してください。");
      return;
    }
    if (reminderType !== "mileage" && !intervalMonths) {
      onError("期間ベースの提案には推奨交換間隔 (月) を入力してください。");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/service-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          vehicle_id: vehicleId || null,
          service_name: serviceName.trim(),
          reminder_type: reminderType,
          last_service_mileage: lastMileage ? Number(lastMileage) : null,
          recommended_interval_km: intervalKm ? Number(intervalKm) : null,
          last_service_date: lastDate || null,
          recommended_interval_months: intervalMonths ? Number(intervalMonths) : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "create failed");
      }
      onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message : "追加に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  const showKm = reminderType !== "interval_months";
  const showMonths = reminderType !== "mileage";

  return (
    <DialogShell title="整備提案を追加" onClose={onClose}>
      <CustomerVehicleFields
        customers={customers}
        vehicles={vehicles}
        customerId={customerId}
        setCustomerId={setCustomerId}
        vehicleId={vehicleId}
        setVehicleId={setVehicleId}
      />

      <div className="mt-4 space-y-4">
        <Field label="サービス名" required>
          <input
            value={serviceName}
            onChange={(e) => setServiceName(e.target.value)}
            placeholder="例: タイヤローテーション、コーティング再施工"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <Field label="提案タイプ">
          <div className="flex flex-wrap gap-2">
            {SERVICE_REMINDER_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReminderType(t)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  reminderType === t
                    ? "border-accent bg-accent-dim text-accent-text"
                    : "border-border-default text-secondary hover:bg-surface-hover"
                }`}
              >
                {t === "mileage" ? "km 毎" : t === "interval_months" ? "月 毎" : "両方"}
              </button>
            ))}
          </div>
        </Field>

        {showKm && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="直近の走行距離 (km)">
              <input
                type="number"
                min={0}
                value={lastMileage}
                onChange={(e) => setLastMileage(e.target.value)}
                placeholder="例: 35000"
                className={`w-full ${inputCls}`}
              />
            </Field>
            <Field label="推奨交換距離 (km)" required>
              <input
                type="number"
                min={1}
                value={intervalKm}
                onChange={(e) => setIntervalKm(e.target.value)}
                placeholder="例: 5000"
                className={`w-full ${inputCls}`}
              />
            </Field>
          </div>
        )}

        {showMonths && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="直近の施工日">
              <input
                type="date"
                value={lastDate}
                onChange={(e) => setLastDate(e.target.value)}
                className={`w-full ${inputCls}`}
              />
            </Field>
            <Field label="推奨交換間隔 (月)" required>
              <input
                type="number"
                min={1}
                value={intervalMonths}
                onChange={(e) => setIntervalMonths(e.target.value)}
                placeholder="例: 6"
                className={`w-full ${inputCls}`}
              />
            </Field>
          </div>
        )}

        <Field label="メモ（任意）">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="例: 次回はフロントタイヤも要確認"
            className={`w-full resize-none ${inputCls}`}
          />
        </Field>
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="追加する" />
    </DialogShell>
  );
}

// ─── 完了登録ダイアログ (完了 + 新規リマインダー再設定) ───
function CompleteDialog({
  reminder,
  onClose,
  onDone,
  onError,
}: {
  reminder: Reminder;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  // 完了登録時に「次回サイクルを再設定するか」を選べる。
  const [recreate, setRecreate] = useState(true);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [newMileage, setNewMileage] = useState(
    reminder.current_mileage != null ? String(reminder.current_mileage) : "",
  );
  const [newDate, setNewDate] = useState(todayStr);
  const [submitting, setSubmitting] = useState(false);

  const showKm = reminder.reminder_type !== "interval_months";
  const showMonths = reminder.reminder_type !== "mileage";

  async function submit() {
    setSubmitting(true);
    try {
      // 1) 現在のリマインダーを完了にする。
      const completeRes = await fetch("/api/admin/service-reminders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: reminder.id, status: "completed" }),
      });
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        throw new Error(err.message ?? "complete failed");
      }

      // 2) 再設定が選ばれていれば、直近施工値を更新した新規リマインダーを起票。
      if (recreate) {
        const createRes = await fetch("/api/admin/service-reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_id: reminder.customer_id,
            vehicle_id: reminder.vehicle_id,
            service_name: reminder.service_name,
            reminder_type: reminder.reminder_type,
            last_service_mileage: showKm && newMileage ? Number(newMileage) : null,
            recommended_interval_km: reminder.recommended_interval_km,
            last_service_date: showMonths ? newDate || null : null,
            recommended_interval_months: reminder.recommended_interval_months,
            notes: reminder.notes,
          }),
        });
        if (!createRes.ok) {
          const err = await createRes.json().catch(() => ({}));
          throw new Error(err.message ?? "recreate failed");
        }
      }
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : "完了登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogShell title={`「${reminder.service_name}」を完了登録`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-secondary">{vehicleLabel(reminder.vehicle)} の整備を完了として記録します。</p>

        <label className="flex items-center gap-2 text-sm text-primary">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={recreate}
            onChange={(e) => setRecreate(e.target.checked)}
          />
          次回サイクルを再設定する
        </label>

        {recreate && (
          <div className="space-y-3 rounded-md border border-border-subtle p-3">
            <div className="text-xs text-muted">今回の施工値を起点に次回提案を作成します。</div>
            {showKm && (
              <Field label="今回の走行距離 (km)">
                <input
                  type="number"
                  min={0}
                  value={newMileage}
                  onChange={(e) => setNewMileage(e.target.value)}
                  placeholder="例: 40000"
                  className={`w-full ${inputCls}`}
                />
              </Field>
            )}
            {showMonths && (
              <Field label="今回の施工日">
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className={`w-full ${inputCls}`}
                />
              </Field>
            )}
          </div>
        )}
      </div>

      <DialogActions onClose={onClose} onSubmit={submit} submitting={submitting} submitLabel="完了登録する" />
    </DialogShell>
  );
}

// ─── 共通: 顧客・車両セレクト UI ───
function CustomerVehicleFields({
  customers,
  vehicles,
  customerId,
  setCustomerId,
  vehicleId,
  setVehicleId,
}: {
  customers: CustomerOption[];
  vehicles: VehicleOption[];
  customerId: string;
  setCustomerId: (v: string) => void;
  vehicleId: string;
  setVehicleId: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="顧客">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`w-full ${inputCls}`}>
          <option value="">（顧客なし）</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="車両">
        <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={`w-full ${inputCls}`}>
          <option value="">（車両なし）</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </Field>
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
