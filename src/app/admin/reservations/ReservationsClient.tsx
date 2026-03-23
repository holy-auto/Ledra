"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import CalendarView from "./CalendarView";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";

// ─── Types ───

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
};

type Customer = { id: string; name: string };
type Vehicle = { id: string; maker: string; model: string; year: number | null; plate_display: string | null };
type MenuItemMaster = { id: string; name: string; unit_price: number };

type Stats = { total: number; today_count: number; active_count: number };
type ReservationsData = { reservations: Reservation[]; stats: Stats };

// ─── Status helpers ───

const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "confirmed", label: "予約確定" },
  { value: "arrived", label: "来店" },
  { value: "in_progress", label: "作業中" },
  { value: "completed", label: "完了" },
  { value: "cancelled", label: "キャンセル" },
];

const STATUS_FLOW = ["confirmed", "arrived", "in_progress", "completed"] as const;

const statusVariant = (s: string) => {
  switch (s) {
    case "confirmed": return "info" as const;
    case "arrived": return "warning" as const;
    case "in_progress": return "info" as const;
    case "completed": return "success" as const;
    case "cancelled": return "danger" as const;
    default: return "default" as const;
  }
};

const statusLabel = (s: string) => {
  switch (s) {
    case "confirmed": return "予約確定";
    case "arrived": return "来店";
    case "in_progress": return "作業中";
    case "completed": return "完了";
    case "cancelled": return "キャンセル";
    default: return s;
  }
};

// ─── Styles ───

const inputCls =
  "w-full rounded-xl border border-neutral-300 bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-sm font-medium text-neutral-700";

// ─── Component ───

export default function ReservationsClient() {
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeDateFilter, setActiveDateFilter] = useState("");

  // Build SWR key
  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeStatusFilter && activeStatusFilter !== "all") params.set("status", activeStatusFilter);
    if (activeDateFilter) {
      params.set("from", activeDateFilter);
      params.set("to", activeDateFilter);
    }
    return `/api/admin/reservations?${params.toString()}`;
  })();

  const { data: swrData, error: swrError, isLoading: loading, mutate } = useSWR<ReservationsData>(
    swrKey,
    fetcher,
    { revalidateOnFocus: true, keepPreviousData: true },
  );

  const reservations = swrData?.reservations ?? [];
  const stats = swrData?.stats ?? null;
  const [mutationErr, setMutationErr] = useState<string | null>(null);
  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : mutationErr;

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // Master data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemMaster[]>([]);

  // Form state
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

  // Cancel dialog
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Googleカレンダー連携
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalLastSynced, setGcalLastSynced] = useState<string | null>(null);

  // ─── Reference data (one-time fetch) ───

  const fetchMasterData = useCallback(async () => {
    try {
      const [custRes, menuRes] = await Promise.all([
        fetch("/api/admin/customers", { cache: "no-store" }),
        fetch("/api/admin/menu-items", { cache: "no-store" }),
      ]);
      const custJ = await custRes.json().catch(() => null);
      if (custRes.ok && custJ?.customers) {
        setCustomers(custJ.customers.map((c: Record<string, unknown>) => ({ id: c.id, name: c.name })));
      }
      const menuJ = await menuRes.json().catch(() => null);
      if (menuRes.ok && menuJ?.items) {
        setMenuItems(menuJ.items.map((m: Record<string, unknown>) => ({ id: m.id, name: m.name, unit_price: m.unit_price })));
      }
      // Googleカレンダー接続状態チェック
      try {
        const gcRes = await fetch("/api/admin/gcal", { cache: "no-store" });
        const gcJ = await gcRes.json().catch(() => null);
        if (gcRes.ok && gcJ?.connected) setGcalConnected(true);
        if (gcJ?.last_synced_at) setGcalLastSynced(gcJ.last_synced_at);
      } catch { /* gcal not configured */ }
    } catch {}
  }, []);

  // Fetch vehicles for a customer
  const fetchVehicles = useCallback(async (customerId?: string) => {
    try {
      const url = customerId
        ? `/api/admin/customers?action=vehicles&customer_id=${encodeURIComponent(customerId)}`
        : "/api/admin/customers?action=vehicles";
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.vehicles) {
        setVehicles(j.vehicles);
      }
    } catch {
      setVehicles([]);
    }
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  // ─── Filter handlers ───

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

  // ─── Form handlers ───

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
    setShowForm(true);
    if (r.customer_id) fetchVehicles(r.customer_id);
    else fetchVehicles();
  };

  const toggleMenuItem = (mi: MenuItemMaster) => {
    const exists = formMenuItems.find((m) => m.menu_item_id === mi.id);
    let next: MenuItem[];
    if (exists) {
      next = formMenuItems.filter((m) => m.menu_item_id !== mi.id);
    } else {
      next = [...formMenuItems, { menu_item_id: mi.id, name: mi.name, price: mi.unit_price }];
    }
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

  // ─── Status change ───

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

  // ─── Cancel ───

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

  // ─── Render ───

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader tag="RESERVATIONS" title="予約管理" />
        <div className="mt-8 text-center text-sm text-muted">読み込み中...</div>
      </div>
    );
  }

  const nextStatus = (current: string) => {
    const idx = STATUS_FLOW.indexOf(current as typeof STATUS_FLOW[number]);
    if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
    return null;
  };

  return (
    <div className="space-y-6">
        <PageHeader
          tag="予約"
          title="予約管理"
          description="予約の登録・管理を行います。"
          actions={
            <button onClick={openCreateForm} className="btn-primary">
              新規予約
            </button>
          }
        />

        {/* Googleカレンダー連携結果フィードバック */}
        {typeof window !== "undefined" && (() => {
          const params = new URLSearchParams(window.location.search);
          const gcalResult = params.get("gcal");
          if (gcalResult === "connected") {
            // URLからパラメータを除去
            window.history.replaceState({}, "", window.location.pathname);
            if (!gcalConnected) setGcalConnected(true);
            return (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                ✅ Googleカレンダーとの連携が完了しました！予約が自動同期されます。
              </div>
            );
          }
          if (gcalResult === "error" || gcalResult === "auth_error") {
            window.history.replaceState({}, "", window.location.pathname);
            return (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
                ❌ Googleカレンダーの連携に失敗しました。再度お試しください。
              </div>
            );
          }
          return null;
        })()}

        {/* Googleカレンダー連携 */}
        <section className="glass-card p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <div>
              <div className="text-sm font-semibold text-primary">Googleカレンダー連携</div>
              <div className="text-xs text-muted">
                {gcalConnected
                  ? `✅ 連携中${gcalLastSynced ? ` — 最終同期: ${new Date(gcalLastSynced).toLocaleString("ja-JP")}` : " — 予約がGoogleカレンダーに自動同期されます"}`
                  : "連携するとGoogleカレンダーと予約を自動同期できます"}
              </div>
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
                      const from = today.toISOString().slice(0, 10);
                      const toDate = new Date(today);
                      toDate.setDate(toDate.getDate() + 90);
                      const to = toDate.toISOString().slice(0, 10);
                      const syncRes = await fetch("/api/admin/gcal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sync", from, to }) });
                      const syncJ = await syncRes.json().catch(() => null);
                      if (syncJ?.synced_at) setGcalLastSynced(syncJ.synced_at);
                      mutate();
                    } catch {}
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
                    await fetch("/api/admin/gcal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disconnect" }) });
                    setGcalConnected(false);
                  }}
                  className="btn-ghost text-xs px-3 py-1.5 text-red-500"
                >
                  連携解除
                </button>
              </>
            ) : (
              <button
                onClick={async () => {
                  setGcalLoading(true);
                  try {
                    const res = await fetch("/api/admin/gcal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "connect" }) });
                    const j = await res.json().catch(() => null);
                    if (j?.auth_url) {
                      window.location.href = j.auth_url;
                    } else if (res.status === 503) {
                      alert("Googleカレンダー連携は現在準備中です。\n\nGoogle Cloud ConsoleでOAuth認証情報を設定し、環境変数（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI）をVercelに登録してください。");
                    } else if (j?.error) {
                      alert("連携エラー: " + (typeof j.error === "string" ? j.error : j.error.message ?? JSON.stringify(j.error)));
                    } else {
                      alert("Googleカレンダー連携の設定が必要です。管理者にお問い合わせください。");
                    }
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
        </section>

        {err && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{err}</div>
        )}

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">本日</div>
            <div className="mt-2 text-2xl font-bold text-primary">{stats?.today_count ?? 0}</div>
            <div className="mt-1 text-xs text-muted">本日の予約</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">進行中</div>
            <div className="mt-2 text-2xl font-bold text-primary">{stats?.active_count ?? 0}</div>
            <div className="mt-1 text-xs text-muted">進行中の予約</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
            <div className="mt-2 text-2xl font-bold text-primary">{stats?.total ?? 0}</div>
            <div className="mt-1 text-xs text-muted">全予約件数</div>
          </div>
        </section>

        {/* Toolbar: view toggle + filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border-subtle overflow-hidden">
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-accent text-inverse" : "bg-surface text-secondary hover:bg-surface-hover"}`}
            >
              リスト
            </button>
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === "calendar" ? "bg-accent text-inverse" : "bg-surface text-secondary hover:bg-surface-hover"}`}
            >
              カレンダー
            </button>
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {/* Date filter */}
          {viewMode === "list" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => handleDateChange(e.target.value)}
                className="rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs text-primary"
              />
              {dateFilter && (
                <button
                  onClick={() => handleDateChange("")}
                  className="text-xs text-muted hover:text-primary"
                >
                  クリア
                </button>
              )}
            </div>
          )}
        </div>

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <CalendarView reservations={reservations} onDateClick={handleCalendarDateClick} />
        )}

        {/* List View */}
        {viewMode === "list" && (
          <section className="glass-card">
            <div className="p-5 border-b border-border-subtle">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted">予約一覧</div>
              <div className="mt-1 text-base font-semibold text-primary">
                {dateFilter && <span className="ml-2 text-sm font-normal text-muted">({formatDate(dateFilter)})</span>}
              </div>
            </div>

            {reservations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">予約がありません。</div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {reservations.map((r) => {
                  const next = nextStatus(r.status);
                  return (
                    <div key={r.id} className="p-4 hover:bg-surface-hover transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-sm font-semibold text-primary">{r.title}</span>
                            <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                            <span>{formatDate(r.scheduled_date)}</span>
                            {r.start_time && (
                              <span>
                                {r.start_time.slice(0, 5)}
                                {r.end_time && ` - ${r.end_time.slice(0, 5)}`}
                              </span>
                            )}
                            {r.customer_name && <span>{r.customer_name}</span>}
                            {r.vehicle_label && <span>{r.vehicle_label}</span>}
                            {r.estimated_amount > 0 && <span>{formatJpy(r.estimated_amount)}</span>}
                          </div>

                          {r.note && (
                            <p className="mt-1 text-xs text-muted truncate max-w-md">{r.note}</p>
                          )}
                          {r.cancel_reason && (
                            <p className="mt-1 text-xs text-red-500">キャンセル理由: {r.cancel_reason}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-1.5">
                          {next && r.status !== "cancelled" && (
                            <button
                              onClick={() => handleStatusChange(r.id, next)}
                              className="btn-primary px-2.5 py-1 text-[11px]"
                            >
                              {statusLabel(next)}へ
                            </button>
                          )}
                          {r.status !== "cancelled" && r.status !== "completed" && (
                            <>
                              <button
                                onClick={() => openEditForm(r)}
                                className="btn-secondary px-2.5 py-1 text-[11px]"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => { setCancelTarget(r.id); setCancelReason(""); }}
                                className="btn-secondary px-2.5 py-1 text-[11px] text-red-500 hover:text-red-600"
                              >
                                取消
                              </button>
                            </>
                          )}
                          {(r.status === "cancelled" || r.status === "completed") && (
                            <button
                              onClick={async () => {
                                if (!confirm("この予約を完全に削除しますか？この操作は取り消せません。")) return;
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
                              className="btn-secondary px-2.5 py-1 text-[11px] text-red-500 hover:text-red-600"
                            >
                              削除
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ─── Create / Edit Modal ─── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowForm(false)}>
            <div className="mx-4 w-full max-w-lg rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-primary mb-4">
                {editingId ? "予約を編集" : "新規予約"}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <label className={labelCls}>
                  <span className={labelTextCls}>予約タイトル <span className="text-red-500">*</span></span>
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
                  <label className={labelCls}>
                    <span className={labelTextCls}>予約日 <span className="text-red-500">*</span></span>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className={inputCls}
                      required
                    />
                  </label>
                  <label className={labelCls}>
                    <span className={labelTextCls}>開始時刻</span>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className={inputCls}
                    />
                  </label>
                  <label className={labelCls}>
                    <span className={labelTextCls}>終了時刻</span>
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
                      <option key={c.id} value={c.id}>{c.name}</option>
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
                        const label = [v.maker, v.model, v.year ? String(v.year) : null].filter(Boolean).join(" ") || "車両";
                        return (
                          <option key={v.id} value={v.id}>
                            {v.plate_display ? `${label} / ${v.plate_display}` : label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                )}

                {/* Menu items */}
                {menuItems.length > 0 && (
                  <div>
                    <span className={labelTextCls}>メニュー</span>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {menuItems.map((mi) => {
                        const selected = formMenuItems.some((m) => m.menu_item_id === mi.id);
                        return (
                          <button
                            key={mi.id}
                            type="button"
                            onClick={() => toggleMenuItem(mi)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              selected
                                ? "border-accent bg-accent-dim text-accent"
                                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
                            }`}
                          >
                            {mi.name} ({formatJpy(mi.unit_price)})
                          </button>
                        );
                      })}
                    </div>
                    {formAmount > 0 && (
                      <div className="mt-2 text-sm font-medium text-primary">
                        見積金額: {formatJpy(formAmount)}
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
                    rows={2}
                    placeholder="備考・メモ"
                  />
                </label>

                {/* Submit */}
                {saveMsg && (
                  <div className={`text-sm ${saveMsg.ok ? "text-green-600" : "text-red-500"}`}>
                    {saveMsg.text}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-4 py-2 text-sm">
                    キャンセル
                  </button>
                  <Button type="submit" loading={saving} disabled={saving}>
                    {editingId ? "更新" : "作成"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Cancel Dialog ─── */}
        {cancelTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setCancelTarget(null)}>
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-primary mb-3">予約をキャンセル</h3>
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
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setCancelTarget(null)} className="btn-secondary px-4 py-2 text-sm">
                  戻る
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                >
                  キャンセル確定
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
