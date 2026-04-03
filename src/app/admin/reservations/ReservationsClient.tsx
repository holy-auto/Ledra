"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CalendarView from "./CalendarView";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import WorkflowStepper from "@/components/workflow/WorkflowStepper";
import type { WorkflowStep } from "@/components/workflow/WorkflowTemplateEditor";

// ─── Types ───────────────────────────────────────────────

type MenuItem = { menu_item_id: string; name: string; price: number };

type Reservation = {
  id: string;
  title: string;
  customer_id: string | null;
  customer_name: string | null;
  vehicle_id: string | null;
  vehicle_label: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number;
  note: string | null;
  menu_items_json: MenuItem[];
  cancel_reason: string | null;
  created_at: string;
  workflow_template_id: string | null;
  current_step_key: string | null;
  current_step_order: number;
  progress_pct: number;
};

type Customer = { id: string; name: string };
type Vehicle = { id: string; maker: string; model: string; year: number | null; plate_display: string | null };
type MenuItemMaster = { id: string; name: string; unit_price: number };
type Stats = { total: number; today_count: number; active_count: number };
type ReservationsData = { reservations: Reservation[]; stats: Stats };

type StepLog = {
  id: string;
  step_key: string;
  step_order: number;
  step_label: string;
  started_at: string | null;
  completed_at: string | null;
  duration_sec: number | null;
  note: string | null;
};

type WorkflowTemplate = {
  id: string;
  name: string;
  service_type: string;
  steps: WorkflowStep[];
};

// ─── Constants ───────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "confirmed", label: "予約確定" },
  { value: "arrived", label: "来店" },
  { value: "in_progress", label: "作業中" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

const STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

// ステータスカラー定義（スマレジ風）
const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    bg: string;
    text: string;
    dot: string;
    variant: "info" | "warning" | "success" | "danger" | "default";
  }
> = {
  confirmed: { label: "予約確定", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500", variant: "info" },
  arrived: { label: "来店", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500", variant: "warning" },
  in_progress: { label: "作業中", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500", variant: "info" },
  completed: {
    label: "完了",
    bg: "bg-success-dim",
    text: "text-success-text",
    dot: "bg-success-dim0",
    variant: "success",
  },
  cancelled: { label: "キャンセル", bg: "bg-inset", text: "text-secondary", dot: "bg-muted", variant: "danger" },
};

const cfg = (s: string) =>
  STATUS_CONFIG[s] ?? {
    label: s,
    bg: "bg-inset",
    text: "text-secondary",
    dot: "bg-muted",
    variant: "default" as const,
  };

// ─── Styles ──────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-xs font-semibold text-secondary tracking-wide uppercase";

// ─── Component ───────────────────────────────────────────

export default function ReservationsClient() {
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeDateFilter, setActiveDateFilter] = useState("");

  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeStatusFilter && activeStatusFilter !== "all") params.set("status", activeStatusFilter);
    if (activeDateFilter) {
      params.set("from", activeDateFilter);
      params.set("to", activeDateFilter);
    }
    return `/api/admin/reservations?${params.toString()}`;
  })();

  const {
    data: swrData,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<ReservationsData>(swrKey, fetcher, { revalidateOnFocus: true, keepPreviousData: true });

  const reservations = swrData?.reservations ?? [];
  const stats = swrData?.stats ?? null;
  const [mutationErr, setMutationErr] = useState<string | null>(null);
  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : mutationErr;

  // View
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Master
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemMaster[]>([]);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formMenuItems, setFormMenuItems] = useState<MenuItem[]>([]);
  const [formAmount, setFormAmount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [formStep, setFormStep] = useState<1 | 2>(1);

  // Cancel
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Gcal
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalLastSynced, setGcalLastSynced] = useState<string | null>(null);
  const [gcalCalendars, setGcalCalendars] = useState<{ id: string; summary: string; primary?: boolean }[]>([]);
  const [gcalCalendarId, setGcalCalendarId] = useState<string | null>(null);
  const [gcalCalendarSaving, setGcalCalendarSaving] = useState(false);
  const [showGcalPanel, setShowGcalPanel] = useState(false);

  // Detail drawer
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailReservation = reservations.find((r) => r.id === detailId) ?? null;

  // Workflow
  const [detailSteps, setDetailSteps] = useState<WorkflowStep[]>([]);
  const [detailStepLogs, setDetailStepLogs] = useState<StepLog[]>([]);
  const [detailTemplates, setDetailTemplates] = useState<WorkflowTemplate[]>([]);
  const [detailTemplateLoading, setDetailTemplateLoading] = useState(false);
  const [workflowTemplateId, setWorkflowTemplateId] = useState("");

  // ─── Reference data ──────────────────────────────────────

  const fetchMasterData = useCallback(async () => {
    try {
      const [custRes, menuRes] = await Promise.all([
        fetch("/api/admin/customers", { cache: "no-store" }),
        fetch("/api/admin/menu-items", { cache: "no-store" }),
      ]);
      const custJ = await custRes.json().catch(() => null);
      if (custRes.ok && custJ?.customers) setCustomers(custJ.customers.map((c: any) => ({ id: c.id, name: c.name })));
      const menuJ = await menuRes.json().catch(() => null);
      if (menuRes.ok && menuJ?.items)
        setMenuItems(menuJ.items.map((m: any) => ({ id: m.id, name: m.name, unit_price: m.unit_price })));

      try {
        const gcRes = await fetch("/api/admin/gcal", { cache: "no-store" });
        const gcJ = await gcRes.json().catch(() => null);
        if (gcRes.ok && gcJ?.connected) {
          setGcalConnected(true);
          if (gcJ?.calendar_id) setGcalCalendarId(gcJ.calendar_id);
          const calRes = await fetch("/api/admin/gcal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list-calendars" }),
          });
          const calJ = await calRes.json().catch(() => null);
          if (calJ?.calendars) setGcalCalendars(calJ.calendars);
        }
        if (gcJ?.last_synced_at) setGcalLastSynced(gcJ.last_synced_at);
      } catch {
        /* gcal not configured */
      }
    } catch {}
  }, []);

  const fetchVehicles = useCallback(async (customerId?: string) => {
    try {
      const url = customerId
        ? `/api/admin/customers?action=vehicles&customer_id=${encodeURIComponent(customerId)}`
        : "/api/admin/customers?action=vehicles";
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles) setVehicles(j.vehicles);
    } catch {
      setVehicles([]);
    }
  }, []);

  const openWorkflowDetail = async (r: Reservation) => {
    setDetailId(r.id);
    if (r.workflow_template_id) {
      try {
        const [tplRes, logsRes] = await Promise.all([
          fetch(`/api/admin/workflow-templates`, { cache: "no-store" }),
          fetch(`/api/admin/reservations/${r.id}/step-logs`, { cache: "no-store" }),
        ]);
        const tplJ = await tplRes.json().catch(() => null);
        const logsJ = await logsRes.json().catch(() => null);
        const templates: WorkflowTemplate[] = tplJ?.templates ?? [];
        const tpl = templates.find((t: WorkflowTemplate) => t.id === r.workflow_template_id);
        if (tpl) setDetailSteps(tpl.steps);
        setDetailStepLogs(logsJ?.step_logs ?? []);
      } catch {
        /* ignore */
      }
    } else {
      setDetailSteps([]);
      setDetailStepLogs([]);
      try {
        setDetailTemplateLoading(true);
        const res = await fetch("/api/admin/workflow-templates", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        setDetailTemplates(j?.templates ?? []);
      } catch {
        /* ignore */
      } finally {
        setDetailTemplateLoading(false);
      }
    }
  };

  const handleStartWorkflow = async (reservationId: string) => {
    if (!workflowTemplateId) return;
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/start-workflow`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflow_template_id: workflowTemplateId }),
      });
      if (!res.ok) throw new Error("Failed");
      mutate();
      setDetailId(null);
    } catch (e: unknown) {
      alert("ワークフロー開始に失敗: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleAdvance = async (reservationId: string, note?: string) => {
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/advance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      mutate();
      // Refresh step logs
      const logsRes = await fetch(`/api/admin/reservations/${reservationId}/step-logs`);
      const logsJ = await logsRes.json().catch(() => null);
      setDetailStepLogs(logsJ?.step_logs ?? []);
    } catch (e: unknown) {
      alert("進行に失敗: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  // ─── Filter handlers ──────────────────────────────────────

  const handleFilterChange = (val: string) => {
    setStatusFilter(val);
    setActiveStatusFilter(val);
  };
  const handleDateChange = (val: string) => {
    setDateFilter(val);
    setActiveDateFilter(val);
  };
  const handleCalendarDateClick = (date: string) => {
    setDateFilter(date);
    setActiveDateFilter(date);
    setViewMode("list");
  };

  // ─── Form handlers ────────────────────────────────────────

  const resetForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormCustomerId("");
    setFormVehicleId("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStartTime("");
    setFormEndTime("");
    setFormNote("");
    setFormMenuItems([]);
    setFormAmount(0);
    setSaveMsg(null);
    setFormStep(1);
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
    fetchVehicles();
  };

  const openEditForm = (r: Reservation) => {
    setEditingId(r.id);
    setFormTitle(r.title);
    setFormCustomerId(r.customer_id ?? "");
    setFormVehicleId(r.vehicle_id ?? "");
    setFormDate(r.scheduled_date);
    setFormStartTime(r.start_time?.slice(0, 5) ?? "");
    setFormEndTime(r.end_time?.slice(0, 5) ?? "");
    setFormNote(r.note ?? "");
    setFormMenuItems(r.menu_items_json ?? []);
    setFormAmount(r.estimated_amount ?? 0);
    setSaveMsg(null);
    setFormStep(1);
    setShowForm(true);
    if (r.customer_id) fetchVehicles(r.customer_id);
    else fetchVehicles();
  };

  const toggleMenuItem = (mi: MenuItemMaster) => {
    const exists = formMenuItems.find((m) => m.menu_item_id === mi.id);
    const next = exists
      ? formMenuItems.filter((m) => m.menu_item_id !== mi.id)
      : [...formMenuItems, { menu_item_id: mi.id, name: mi.name, price: mi.unit_price }];
    setFormMenuItems(next);
    setFormAmount(next.reduce((sum, m) => sum + m.price, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const payload: Record<string, unknown> = {
      title: formTitle,
      customer_id: formCustomerId || null,
      vehicle_id: formVehicleId || null,
      scheduled_date: formDate,
      start_time: formStartTime || null,
      end_time: formEndTime || null,
      note: formNote || null,
      menu_items_json: formMenuItems,
      estimated_amount: formAmount,
    };
    if (editingId) payload.id = editingId;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setSaveMsg({ text: editingId ? "予約を更新しました" : "予約を作成しました", ok: true });
      setShowForm(false);
      resetForm();
      mutate();
    } catch (e: unknown) {
      setSaveMsg({ text: e instanceof Error ? e.message : String(e), ok: false });
    } finally {
      setSaving(false);
    }
  };

  // ─── Status change ────────────────────────────────────────

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      mutate();
    } catch (e: unknown) {
      setMutationErr(e instanceof Error ? e.message : String(e));
    }
  };

  // ─── Cancel ──────────────────────────────────────────────

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelTarget, cancel_reason: cancelReason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setCancelTarget(null);
      setCancelReason("");
      mutate();
    } catch (e: unknown) {
      setMutationErr(e instanceof Error ? e.message : String(e));
    }
  };

  const nextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current as (typeof STATUS_FLOW)[number]);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
    return null;
  };

  // ─── Group reservations by date ──────────────────────────

  const grouped = reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
    if (!acc[r.scheduled_date]) acc[r.scheduled_date] = [];
    acc[r.scheduled_date].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort();

  const today = new Date().toISOString().slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader tag="RESERVATIONS" title="予約管理" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page Header ── */}
      <PageHeader
        tag="予約"
        title="予約管理"
        description="予約の登録・管理を行います。"
        actions={
          <button
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            新規予約
          </button>
        }
      />

      {/* ── Gcal feedback ── */}
      {typeof window !== "undefined" &&
        (() => {
          const params = new URLSearchParams(window.location.search);
          const gcalResult = params.get("gcal");
          if (gcalResult === "connected") {
            window.history.replaceState({}, "", window.location.pathname);
            if (!gcalConnected) setGcalConnected(true);
            return (
              <div className="rounded-xl border border-blue-200 bg-accent-dim p-3 text-sm text-accent-text">
                ✅ Googleカレンダーとの連携が完了しました！
              </div>
            );
          }
          if (gcalResult === "error" || gcalResult === "auth_error") {
            window.history.replaceState({}, "", window.location.pathname);
            return (
              <div className="rounded-xl border border-danger/20 bg-danger-dim p-3 text-sm text-danger-text">
                ❌ Googleカレンダーの連携に失敗しました。再度お試しください。
              </div>
            );
          }
          return null;
        })()}

      {err && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim p-3 text-sm text-danger-text">{err}</div>
      )}

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "本日の予約", value: stats?.today_count ?? 0, icon: "📅", color: "from-blue-500 to-blue-600" },
          { label: "進行中", value: stats?.active_count ?? 0, icon: "⚙️", color: "from-violet-500 to-violet-600" },
          { label: "総予約数", value: stats?.total ?? 0, icon: "📋", color: "from-blue-500 to-blue-600" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4 relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-5`} />
            <div className="relative">
              <div className="text-xs font-semibold text-muted tracking-wide">{s.label}</div>
              <div className="mt-1.5 text-2xl font-bold text-primary">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* View toggle */}
        <div className="flex rounded-xl border border-border-subtle overflow-hidden shadow-sm">
          {(["list", "calendar"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setViewMode(m)}
              className={`px-3.5 py-2 text-xs font-semibold transition-colors ${
                viewMode === m ? "bg-accent text-white" : "bg-surface text-secondary hover:bg-surface-hover"
              }`}
            >
              {m === "list" ? "リスト" : "カレンダー"}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-xs text-primary shadow-sm"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Date filter */}
        {viewMode === "list" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => handleDateChange(e.target.value)}
              className="rounded-xl border border-border-subtle bg-surface px-3 py-2 text-xs text-primary shadow-sm"
            />
            {dateFilter && (
              <button
                onClick={() => handleDateChange("")}
                className="text-xs text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-hover"
              >
                ✕ クリア
              </button>
            )}
          </div>
        )}

        {/* Gcal button */}
        <button
          onClick={() => setShowGcalPanel(!showGcalPanel)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors shadow-sm ${
            gcalConnected
              ? "border-blue-200 bg-accent-dim text-accent-text"
              : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25"
            />
          </svg>
          {gcalConnected ? "Gcal 連携中" : "Gcal 連携"}
        </button>
      </div>

      {/* ── Gcal panel (collapsible) ── */}
      {showGcalPanel && (
        <section className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-primary">Googleカレンダー連携</div>
              <div className="text-xs text-muted mt-0.5">
                {gcalConnected
                  ? `✅ 連携中${gcalLastSynced ? ` — 最終同期: ${new Date(gcalLastSynced).toLocaleString("ja-JP")}` : ""}`
                  : "連携するとGoogleカレンダーと予約を自動同期できます"}
              </div>
            </div>
            <div className="flex gap-2">
              {gcalConnected ? (
                <>
                  <button
                    onClick={async () => {
                      setGcalSyncing(true);
                      try {
                        const today = new Date();
                        const from = new Date(today);
                        from.setDate(from.getDate() - 30);
                        const to = new Date(today);
                        to.setDate(to.getDate() + 90);
                        const syncRes = await fetch("/api/admin/gcal", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            action: "sync",
                            from: from.toISOString().slice(0, 10),
                            to: to.toISOString().slice(0, 10),
                          }),
                        });
                        const syncJ = await syncRes.json().catch(() => null);
                        if (syncJ?.synced_at) setGcalLastSynced(syncJ.synced_at);
                        mutate();
                      } catch {
                        alert("同期中にエラーが発生しました");
                      }
                      setGcalSyncing(false);
                    }}
                    disabled={gcalSyncing}
                    className="btn-secondary text-xs px-3 py-1.5"
                  >
                    {gcalSyncing ? "同期中..." : "今すぐ同期"}
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Googleカレンダー連携を解除しますか？")) return;
                      await fetch("/api/admin/gcal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "disconnect" }),
                      });
                      setGcalConnected(false);
                      setGcalCalendars([]);
                      setGcalCalendarId(null);
                    }}
                    className="btn-ghost text-xs px-3 py-1.5 text-danger"
                  >
                    連携解除
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    setGcalLoading(true);
                    try {
                      const res = await fetch("/api/admin/gcal", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "connect" }),
                      });
                      const j = await res.json().catch(() => null);
                      if (j?.auth_url) window.location.href = j.auth_url;
                      else alert("Googleカレンダー連携の設定が必要です。管理者にお問い合わせください。");
                    } catch {
                      alert("通信エラーが発生しました");
                    }
                    setGcalLoading(false);
                  }}
                  disabled={gcalLoading}
                  className="btn-primary text-xs px-4 py-1.5"
                >
                  {gcalLoading ? "準備中..." : "Googleカレンダーと連携"}
                </button>
              )}
            </div>
          </div>
          {gcalConnected && gcalCalendars.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <label className="text-xs text-muted whitespace-nowrap">同期先カレンダー:</label>
              <select
                value={gcalCalendarId ?? "primary"}
                onChange={async (e) => {
                  const id = e.target.value;
                  setGcalCalendarId(id);
                  setGcalCalendarSaving(true);
                  await fetch("/api/admin/gcal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "set-calendar", calendar_id: id }),
                  });
                  setGcalCalendarSaving(false);
                }}
                disabled={gcalCalendarSaving}
                className="text-xs border border-border rounded px-2 py-1 flex-1 bg-background text-primary"
              >
                {gcalCalendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.summary}
                    {c.primary ? " (メイン)" : ""}
                  </option>
                ))}
              </select>
              {gcalCalendarSaving && <span className="text-xs text-muted">保存中...</span>}
            </div>
          )}
        </section>
      )}

      {/* ── Calendar View ── */}
      {viewMode === "calendar" && <CalendarView reservations={reservations} onDateClick={handleCalendarDateClick} />}

      {/* ── List View ── */}
      {viewMode === "list" && (
        <>
          {reservations.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-sm text-muted">条件に一致する予約がありません。</p>
              <button onClick={openCreateForm} className="mt-4 btn-primary text-sm px-5 py-2">
                新規予約を作成
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((date) => {
                const isToday = date === today;
                const dayReservations = grouped[date];
                return (
                  <div key={date}>
                    {/* Date header */}
                    <div className={`flex items-center gap-2 mb-2 px-1`}>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-wide rounded-full px-3 py-1 ${
                          isToday ? "bg-accent text-white" : "bg-surface text-muted border border-border-subtle"
                        }`}
                      >
                        {isToday && "今日 • "}
                        {formatDate(date)}
                        <span className="opacity-60">({dayReservations.length}件)</span>
                      </span>
                      <div className="flex-1 h-px bg-border-subtle" />
                    </div>

                    {/* Cards */}
                    <div className="space-y-2">
                      {dayReservations.map((r) => {
                        const c = cfg(r.status);
                        const next = nextStatus(r.status);
                        return (
                          <div
                            key={r.id}
                            className={`glass-card overflow-hidden transition-shadow hover:shadow-md ${
                              r.status === "cancelled" ? "opacity-60" : ""
                            }`}
                          >
                            {/* Status color bar */}
                            <div className={`h-1 w-full ${c.dot}`} />

                            <div className="p-4">
                              <div className="flex items-start gap-3">
                                {/* Left: info */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    {/* Status badge */}
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.bg} ${c.text}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                      {c.label}
                                    </span>
                                    {/* Time */}
                                    {r.start_time && (
                                      <span className="text-xs font-semibold text-primary bg-surface-hover rounded-full px-2.5 py-0.5">
                                        🕐 {r.start_time.slice(0, 5)}
                                        {r.end_time && ` – ${r.end_time.slice(0, 5)}`}
                                      </span>
                                    )}
                                    {/* Mini progress bar for workflow-enabled reservations */}
                                    {r.workflow_template_id && (
                                      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
                                        <span className="w-16 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                                          <span
                                            className="block h-full rounded-full bg-accent transition-all"
                                            style={{ width: `${r.progress_pct}%` }}
                                          />
                                        </span>
                                        {r.progress_pct}%
                                      </span>
                                    )}
                                  </div>

                                  {/* Title */}
                                  <div className="text-sm font-bold text-primary mb-1">{r.title}</div>

                                  {/* Meta */}
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                                    {r.customer_name && (
                                      <span className="flex items-center gap-1">
                                        <svg
                                          className="w-3 h-3"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                                          />
                                        </svg>
                                        {r.customer_name}
                                      </span>
                                    )}
                                    {r.vehicle_label && (
                                      <span className="flex items-center gap-1">
                                        <svg
                                          className="w-3 h-3"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
                                          />
                                        </svg>
                                        {r.vehicle_label}
                                      </span>
                                    )}
                                    {r.estimated_amount > 0 && (
                                      <span className="font-semibold text-primary">
                                        {formatJpy(r.estimated_amount)}
                                      </span>
                                    )}
                                  </div>

                                  {r.note && (
                                    <p className="mt-1.5 text-xs text-muted bg-surface-hover rounded-lg px-2.5 py-1.5 truncate max-w-sm">
                                      💬 {r.note}
                                    </p>
                                  )}
                                  {r.cancel_reason && (
                                    <p className="mt-1 text-xs text-danger">キャンセル理由: {r.cancel_reason}</p>
                                  )}
                                </div>

                                {/* Right: actions */}
                                <div className="flex flex-col items-end gap-1.5 shrink-0">
                                  {/* Detail button */}
                                  <button
                                    onClick={() => {
                                      if (detailId === r.id) {
                                        setDetailId(null);
                                      } else {
                                        openWorkflowDetail(r);
                                      }
                                    }}
                                    className="text-[11px] text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-hover transition-colors"
                                  >
                                    詳細 {detailId === r.id ? "▲" : "▼"}
                                  </button>

                                  {/* Next status button */}
                                  {next && r.status !== "cancelled" && (
                                    <button
                                      onClick={() => handleStatusChange(r.id, next)}
                                      className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${cfg(next).bg} ${cfg(next).text} hover:opacity-80`}
                                    >
                                      {cfg(next).label}へ →
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Detail panel */}
                              {detailId === r.id && (
                                <div className="mt-3 pt-3 border-t border-border-subtle flex flex-wrap gap-2">
                                  {r.status !== "cancelled" && r.status !== "completed" && (
                                    <button
                                      onClick={() => {
                                        openEditForm(r);
                                        setDetailId(null);
                                      }}
                                      className="btn-secondary px-3 py-1.5 text-xs"
                                    >
                                      ✏️ 編集
                                    </button>
                                  )}
                                  {r.status !== "cancelled" && r.status !== "completed" && (
                                    <button
                                      onClick={() => {
                                        setCancelTarget(r.id);
                                        setCancelReason("");
                                        setDetailId(null);
                                      }}
                                      className="px-3 py-1.5 text-xs rounded-lg border border-danger/20 bg-danger-dim text-danger-text hover:bg-danger/10 transition-colors"
                                    >
                                      🚫 取消
                                    </button>
                                  )}
                                  {(r.status === "cancelled" || r.status === "completed") && (
                                    <button
                                      onClick={async () => {
                                        if (!confirm("この予約を完全に削除しますか？この操作は取り消せません。"))
                                          return;
                                        try {
                                          const res = await fetch("/api/admin/reservations", {
                                            method: "DELETE",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ id: r.id, hard_delete: true }),
                                          });
                                          if (!res.ok) throw new Error("削除に失敗しました");
                                          mutate();
                                        } catch (e: unknown) {
                                          setMutationErr(e instanceof Error ? e.message : String(e));
                                        }
                                      }}
                                      className="px-3 py-1.5 text-xs rounded-lg border border-danger/20 bg-danger-dim text-danger-text hover:bg-danger/10 transition-colors"
                                    >
                                      🗑️ 削除
                                    </button>
                                  )}
                                  {r.menu_items_json?.length > 0 && (
                                    <div className="w-full mt-1 flex flex-wrap gap-1.5">
                                      {r.menu_items_json.map((m) => (
                                        <span
                                          key={m.menu_item_id}
                                          className="text-[11px] bg-surface-hover text-secondary rounded-full px-2.5 py-0.5 border border-border-subtle"
                                        >
                                          {m.name} {formatJpy(m.price)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Create / Edit Modal ─── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
              <div>
                <h2 className="text-base font-bold text-primary">{editingId ? "予約を編集" : "新規予約"}</h2>
                <div className="flex gap-2 mt-1.5">
                  {[1, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => (s === 2 && formTitle && formDate ? setFormStep(2) : setFormStep(1))}
                      className={`flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors ${
                        formStep === s
                          ? "bg-accent text-white"
                          : s < formStep
                            ? "bg-accent-dim text-accent-text"
                            : "bg-surface-hover text-muted"
                      }`}
                    >
                      <span>{s}</span>
                      <span>{s === 1 ? "基本情報" : "詳細・メニュー"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="p-2 rounded-xl hover:bg-surface-hover text-muted transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                {formStep === 1 ? (
                  <>
                    {/* Title */}
                    <label className={labelCls}>
                      <span className={labelTextCls}>
                        予約タイトル <span className="text-danger">*</span>
                      </span>
                      <input
                        type="text"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className={inputCls}
                        placeholder="例: ガラスコーティング"
                        required
                      />
                    </label>

                    {/* Date & Time */}
                    <div className="grid grid-cols-3 gap-3">
                      <label className={`${labelCls} col-span-1`}>
                        <span className={labelTextCls}>
                          予約日 <span className="text-danger">*</span>
                        </span>
                        <input
                          type="date"
                          value={formDate}
                          onChange={(e) => setFormDate(e.target.value)}
                          className={inputCls}
                          required
                        />
                      </label>
                      <label className={labelCls}>
                        <span className={labelTextCls}>開始</span>
                        <input
                          type="time"
                          value={formStartTime}
                          onChange={(e) => setFormStartTime(e.target.value)}
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        <span className={labelTextCls}>終了</span>
                        <input
                          type="time"
                          value={formEndTime}
                          onChange={(e) => setFormEndTime(e.target.value)}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    {/* Customer */}
                    <label className={labelCls}>
                      <span className={labelTextCls}>顧客</span>
                      <select
                        value={formCustomerId}
                        onChange={(e) => {
                          setFormCustomerId(e.target.value);
                          setFormVehicleId("");
                          if (e.target.value) fetchVehicles(e.target.value);
                          else fetchVehicles();
                        }}
                        className={inputCls}
                      >
                        <option value="">未選択</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* Vehicle */}
                    {vehicles.length > 0 && (
                      <label className={labelCls}>
                        <span className={labelTextCls}>車両</span>
                        <select
                          value={formVehicleId}
                          onChange={(e) => setFormVehicleId(e.target.value)}
                          className={inputCls}
                        >
                          <option value="">未選択</option>
                          {vehicles.map((v) => {
                            const label =
                              [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || "車両";
                            return (
                              <option key={v.id} value={v.id}>
                                {v.plate_display ? `${label} / ${v.plate_display}` : label}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                    )}

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setFormStep(2)}
                        disabled={!formTitle || !formDate}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent transition-colors disabled:opacity-40"
                      >
                        次へ
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Menu items */}
                    {menuItems.length > 0 && (
                      <div>
                        <span className={labelTextCls}>メニュー</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {menuItems.map((mi) => {
                            const selected = formMenuItems.some((m) => m.menu_item_id === mi.id);
                            return (
                              <button
                                key={mi.id}
                                type="button"
                                onClick={() => toggleMenuItem(mi)}
                                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                                  selected
                                    ? "border-accent bg-accent-dim text-accent-text shadow-sm"
                                    : "border-border-default bg-surface text-secondary hover:border-border-strong"
                                }`}
                              >
                                {selected ? "✓ " : ""}
                                {mi.name} ({formatJpy(mi.unit_price)})
                              </button>
                            );
                          })}
                        </div>
                        {formAmount > 0 && (
                          <div className="mt-3 flex items-center justify-between bg-accent-dim border border-accent/20 rounded-xl px-4 py-2.5">
                            <span className="text-xs text-accent-text font-medium">見積金額</span>
                            <span className="text-base font-bold text-accent-text">{formatJpy(formAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Note */}
                    <label className={labelCls}>
                      <span className={labelTextCls}>備考</span>
                      <textarea
                        value={formNote}
                        onChange={(e) => setFormNote(e.target.value)}
                        className={inputCls}
                        rows={3}
                        placeholder="備考・メモ"
                      />
                    </label>

                    {saveMsg && (
                      <div
                        className={`text-sm p-3 rounded-xl ${saveMsg.ok ? "bg-success-dim text-success-text" : "bg-danger-dim text-danger-text"}`}
                      >
                        {saveMsg.text}
                      </div>
                    )}

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setFormStep(1)}
                        className="flex-1 rounded-xl border border-border-default py-2.5 text-sm font-medium text-secondary hover:bg-surface-hover transition-colors"
                      >
                        ← 戻る
                      </button>
                      <Button type="submit" loading={saving} disabled={saving} className="flex-1">
                        {editingId ? "更新する" : "予約を作成"}
                      </Button>
                    </div>
                  </>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── Cancel Dialog ─── */}
      {cancelTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setCancelTarget(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-danger-dim flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-danger"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <h3 className="text-base font-bold text-primary text-center mb-1">予約をキャンセルしますか？</h3>
            <p className="text-xs text-muted text-center mb-4">この操作は取り消せません。</p>
            <label className={labelCls}>
              <span className={labelTextCls}>キャンセル理由</span>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className={inputCls}
                rows={2}
                placeholder="キャンセル理由（任意）"
              />
            </label>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="flex-1 rounded-xl border border-border-default py-2.5 text-sm font-medium text-secondary hover:bg-surface-hover transition-colors"
              >
                戻る
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-semibold text-white hover:bg-danger/90 transition-colors"
              >
                キャンセル確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Workflow Detail Drawer ─── */}
      {detailId && detailReservation && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => setDetailId(null)}
        >
          <div
            className="w-full max-w-md bg-surface shadow-2xl h-full overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-surface border-b border-border-subtle p-4 flex items-center justify-between z-10">
              <div>
                <div className="text-xs text-muted">予約詳細</div>
                <div className="text-sm font-semibold text-primary">{detailReservation.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setDetailId(null)}
                className="p-1 rounded-lg hover:bg-surface-hover text-muted"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted">日時</span>
                  <div className="font-medium text-primary">{formatDate(detailReservation.scheduled_date)}</div>
                </div>
                <div>
                  <span className="text-muted">ステータス</span>
                  <div>
                    <Badge variant={cfg(detailReservation.status).variant}>{cfg(detailReservation.status).label}</Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted">顧客</span>
                  <div className="font-medium text-primary">{detailReservation.customer_name ?? "-"}</div>
                </div>
                <div>
                  <span className="text-muted">車両</span>
                  <div className="font-medium text-primary">{detailReservation.vehicle_label ?? "-"}</div>
                </div>
              </div>

              {/* Workflow */}
              {detailReservation.workflow_template_id ? (
                <WorkflowStepper
                  reservationId={detailReservation.id}
                  templateId={detailReservation.workflow_template_id}
                  steps={detailSteps}
                  stepLogs={detailStepLogs}
                  currentStepOrder={detailReservation.current_step_order}
                  progressPct={detailReservation.progress_pct}
                  status={detailReservation.status}
                  onAdvance={(note) => handleAdvance(detailReservation.id, note)}
                />
              ) : (
                <div className="glass-card p-4 space-y-3">
                  <div className="text-xs font-semibold text-muted">ワークフロー未設定</div>
                  <p className="text-xs text-muted">テンプレートを選択してワークフローを開始できます。</p>
                  {detailTemplateLoading ? (
                    <div className="text-xs text-muted">読み込み中...</div>
                  ) : (
                    <>
                      <select
                        className="select-field text-sm"
                        value={workflowTemplateId}
                        onChange={(e) => setWorkflowTemplateId(e.target.value)}
                      >
                        <option value="">テンプレートを選択</option>
                        {detailTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}（{t.steps.length}ステップ）
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-primary w-full text-sm"
                        disabled={!workflowTemplateId}
                        onClick={() => handleStartWorkflow(detailReservation.id)}
                      >
                        ワークフロー開始
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
