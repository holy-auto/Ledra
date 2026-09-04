"use client";
import { parseJsonSafe } from "@/lib/api/safeJson";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import EmptyStateGuide from "@/components/ui/EmptyStateGuide";
import { estimateReservationMinutes, formatMinutes } from "@/lib/booths/duration";
import { decomposeTasks } from "@/lib/booking/tasks";
import { menuCategoriesOf, filterMenuItems } from "@/lib/reservations/menuFilter";
import {
  RESERVATION_STATUS_FLOW,
  RESERVATION_STATUS_DISPLAY,
  LIVE_RESERVATION_STATUSES,
  reservationStatusDisplay,
} from "@/lib/domain/jobStatusDisplay";
import dynamic from "next/dynamic";

const CalendarView = dynamic(() => import("./CalendarView"), {
  ssr: false,
  loading: () => <div className="glass-card h-96 animate-pulse bg-surface-hover rounded-2xl" />,
});
const VoiceMemoPanel = dynamic(() => import("@/app/admin/certificates/new/VoiceMemoPanel"), { ssr: false });
import { canUseFeature, normalizePlanTier } from "@/lib/billing/planFeatures";
import { businessDateString } from "@/lib/datetime";
import { formatDate, formatJpy } from "@/lib/format";
import { fetcher } from "@/lib/swr";
import { useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";
import { getWebReservationPresentation } from "@/lib/ui-preferences/reservationsPresentation";
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
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  status: string;
  estimated_amount: number;
  note: string | null;
  menu_items_json: MenuItem[];
  cancel_reason: string | null;
  created_at: string;
  workflow_template_id: string | null;
  loaner_car_id: string | null;
  current_step_key: string | null;
  current_step_order: number;
  progress_pct: number;
};

type LoanerCar = { id: string; name: string; plate_display: string | null; is_active: boolean };

type Customer = { id: string; name: string };
type Vehicle = { id: string; maker: string; model: string; year: number | null; plate_display: string | null };
type MenuItemMaster = {
  id: string;
  name: string;
  unit_price: number;
  estimated_minutes: number | null;
  category_large: string | null;
};
type BookingCandidate = {
  date: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_end: string;
  remaining: number;
  fits: boolean;
  loaner_free: number | null;
  accepted_categories: string[] | null;
  staff_free: number | null;
};

const WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;
type Stats = { total: number; today_count: number; active_count: number };
type ReservationsData = {
  reservations: Reservation[];
  stats: Stats;
  total?: number;
};
const EMPTY_RESERVATIONS: Reservation[] = [];

type WorkflowTemplate = {
  id: string;
  name: string;
  service_type: string;
  steps: WorkflowStep[];
};

// ─── Constants ───────────────────────────────────────────

// LIVE_RESERVATION_STATUSES に絞る: RESERVATION_STATUS_DISPLAY を素で列挙すると、
// DB マイグレーション未実施の IMP-031 例外状態(paused/no_show/partially_completed)が
// 選択肢に混ざり、選んでも常に0件になる罠になる。
const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  ...LIVE_RESERVATION_STATUSES.map((value) => ({ value, label: RESERVATION_STATUS_DISPLAY[value].label })),
];

// ponytail: IMP-022 — STATUS_CONFIG / STATUS_FLOW は jobStatusDisplay.ts に統合。
// cfg() は reservationStatusDisplay() に置き換え。
const cfg = reservationStatusDisplay;
const STATUS_FLOW = RESERVATION_STATUS_FLOW;

// ─── Styles ──────────────────────────────────────────────

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface text-primary px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow";
const labelCls = "block space-y-1.5";
const labelTextCls = "text-xs font-semibold text-secondary tracking-wide uppercase";

// ─── Component ───────────────────────────────────────────

export default function ReservationsClient() {
  // Quick Create などから ?create=1 で遷移してきたら新規予約フォームを自動で開く
  // （CustomersClient と同じ規約）。
  const searchParams = useSearchParams();
  const autoOpenCreate = searchParams.get("create") === "1";
  const { displayMode } = useUiPreferences();
  const presentation = getWebReservationPresentation(displayMode);
  const isDense = presentation.listVariant === "dense";

  // ローカル(端末)日付の YYYY-MM-DD。toISOString() は UTC 変換されるため、JST 深夜帯
  // (00:00〜08:59) だと日付が1日前にずれる — ブラウザのローカル時計から直接組み立てる。
  const today = businessDateString();

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [activeStatusFilter, setActiveStatusFilter] = useState("all");
  const [activeDateFilter, setActiveDateFilter] = useState("");
  // 古い予約は既定で隠す（本日以降のみ表示）。過去分は明示的にトグルしたときだけ読み込む。
  // カレンダー表示では月移動で過去月も見る必要があるためこの既定フィルタは適用しない
  // （過去分トグルはリスト表示にしか出さないので、絞ったままだと見る手段が無くなる）。
  const [showPast, setShowPast] = useState(false);

  // View
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  const swrKey = (() => {
    const params = new URLSearchParams();
    if (activeStatusFilter && activeStatusFilter !== "all") params.set("status", activeStatusFilter);
    if (activeDateFilter) {
      params.set("from", activeDateFilter);
      params.set("to", activeDateFilter);
    } else if (!showPast && viewMode === "list") {
      params.set("from", today);
    }
    if (viewMode === "list") {
      params.set("page", "1");
      params.set("per_page", String(presentation.pageSize));
    }
    return `/api/admin/reservations?${params.toString()}`;
  })();

  const {
    data: swrData,
    error: swrError,
    isLoading: loading,
    mutate,
  } = useSWR<ReservationsData>(swrKey, fetcher, { revalidateOnFocus: true, keepPreviousData: true });

  const reservations = swrData?.reservations ?? EMPTY_RESERVATIONS;
  const stats = swrData?.stats ?? null;
  const resultTotal = swrData?.total ?? reservations.length;
  const [mutationErr, setMutationErr] = useState<string | null>(null);
  const err = swrError ? (swrError.message ?? "読み込みに失敗しました") : mutationErr;

  // Transitions — defers heavy re-renders so button presses feel instant
  const [, startFilterTransition] = useTransition();
  const [, startFormTransition] = useTransition();

  // Master
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemMaster[]>([]);
  // 工程テンプレート（作業タスク分解の展開元）
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  // 代車（予約への割当用・稼働中のみ）
  const [loaners, setLoaners] = useState<LoanerCar[]>([]);
  // 音声→備考 (Standard 以上の ai_draft 機能)。current tenant の plan_tier から判定。
  const [canAiNote, setCanAiNote] = useState(false);

  // Form
  const [showForm, setShowForm] = useState(autoOpenCreate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formStartTime, setFormStartTime] = useState("");
  const [formEndTime, setFormEndTime] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formNote, setFormNote] = useState("");
  const [formMenuItems, setFormMenuItems] = useState<MenuItem[]>([]);
  const [formAmount, setFormAmount] = useState(0);
  // メニュー選択の絞り込み。品目マスタが多いと一覧が縦に伸びて選びにくいため、
  // 検索文字列 + 大カテゴリで候補を絞る。
  const [menuQuery, setMenuQuery] = useState("");
  const [menuCategory, setMenuCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [formStep, setFormStep] = useState<1 | 2>(1);

  // 工程テンプレート選択（"" = 品目から自動）。作業タスク分解の展開元＆予約への紐付け。
  const [taskTemplateId, setTaskTemplateId] = useState("");
  // この予約に割り当てる代車（"" = なし）。
  const [formLoanerId, setFormLoanerId] = useState("");
  // 編集中予約のワークフローが開始済みか（開始後はテンプレート変更不可）。
  const [formWorkflowStarted, setFormWorkflowStarted] = useState(false);
  // 日程候補の提案（受けられる日程）
  const [needsLoaner, setNeedsLoaner] = useState(false);
  const [considerStaff, setConsiderStaff] = useState(true);
  const [candidates, setCandidates] = useState<BookingCandidate[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesErr, setCandidatesErr] = useState<string | null>(null);

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
  const [gcalReadCalendars, setGcalReadCalendars] = useState<{ id: string; mode: "full" | "busy" }[]>([]);
  const [gcalCalendarSaving, setGcalCalendarSaving] = useState(false);
  const [showGcalPanel, setShowGcalPanel] = useState(false);
  const [gcalFeedback, setGcalFeedback] = useState<"connected" | "error" | null>(null);

  // ?gcal=... のフィードバックはマウント時に一度だけ処理する（レンダー中の setState/replaceState を避ける）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalResult = params.get("gcal");
    if (gcalResult === "connected") {
      setGcalFeedback("connected");
      setGcalConnected(true);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (gcalResult === "error" || gcalResult === "auth_error") {
      setGcalFeedback("error");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Booking URL
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [showBookingUrlPanel, setShowBookingUrlPanel] = useState(false);
  const [bookingUrlCopied, setBookingUrlCopied] = useState(false);

  // Inline card actions (edit / cancel / delete) — expand-in-place, not a workflow view.
  // ワークフロー詳細は /admin/jobs/[id] に一本化（旧: 別ドロワーで二重表示していた）。
  const [detailId, setDetailId] = useState<string | null>(null);

  // ─── Reference data ──────────────────────────────────────

  const fetchMasterData = useCallback(async () => {
    try {
      const [custRes, menuRes, tenantRes, tmplRes, loanerRes] = await Promise.all([
        fetch("/api/admin/customers"),
        fetch("/api/admin/menu-items"),
        fetch("/api/admin/tenants"),
        fetch("/api/admin/workflow-templates"),
        fetch("/api/admin/loaner-cars"),
      ]);
      const tmplJ = await parseJsonSafe(tmplRes);
      if (tmplRes.ok && tmplJ?.templates) setTemplates(tmplJ.templates as WorkflowTemplate[]);
      const loanerJ = await parseJsonSafe(loanerRes);
      if (loanerRes.ok && loanerJ?.cars) {
        setLoaners((loanerJ.cars as LoanerCar[]).filter((c) => c.is_active));
      }
      const tenantJ = await parseJsonSafe(tenantRes);
      if (tenantRes.ok && tenantJ?.tenants) {
        const current = tenantJ.tenants.find((t: any) => t.is_current) ?? tenantJ.tenants[0];
        if (current?.slug) setTenantSlug(current.slug);
        if (current?.plan_tier) setCanAiNote(canUseFeature(normalizePlanTier(current.plan_tier), "ai_draft"));
      }
      const custJ = await parseJsonSafe(custRes);
      if (custRes.ok && custJ?.customers) setCustomers(custJ.customers.map((c: any) => ({ id: c.id, name: c.name })));
      const menuJ = await parseJsonSafe(menuRes);
      if (menuRes.ok && menuJ?.items)
        setMenuItems(
          menuJ.items.map((m: any) => ({
            id: m.id,
            name: m.name,
            unit_price: m.unit_price,
            estimated_minutes: m.estimated_minutes ?? null,
            category_large: m.category_large ?? null,
          })),
        );

      try {
        const gcRes = await fetch("/api/admin/gcal");
        const gcJ = await parseJsonSafe(gcRes);
        if (gcRes.ok && gcJ?.connected) {
          setGcalConnected(true);
          if (gcJ?.calendar_id) setGcalCalendarId(gcJ.calendar_id);
          if (Array.isArray(gcJ?.read_calendars)) setGcalReadCalendars(gcJ.read_calendars);
          const calRes = await fetch("/api/admin/gcal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "list-calendars" }),
          });
          const calJ = await parseJsonSafe(calRes);
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
      const res = await fetch(url);
      const j = await parseJsonSafe(res);
      if (res.ok && j?.vehicles) setVehicles(j.vehicles);
    } catch {
      setVehicles([]);
    }
  }, []);

  // ?create=1 で自動オープンした場合、通常は「+ 新規予約」ボタンが行う
  // 車両一覧の取得（openCreateForm 内の fetchVehicles）が走らないので、ここで補う。
  useEffect(() => {
    if (autoOpenCreate) fetchVehicles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchMasterData();
  }, [fetchMasterData]);

  // ─── Filter handlers ──────────────────────────────────────

  const handleFilterChange = (val: string) => {
    setStatusFilter(val); // urgent: reflect selection immediately
    startFilterTransition(() => setActiveStatusFilter(val)); // deferred: triggers SWR refetch
  };
  const handleDateChange = (val: string) => {
    setDateFilter(val); // urgent
    startFilterTransition(() => setActiveDateFilter(val)); // deferred
  };
  const handleCalendarDateClick = (date: string) => {
    startFilterTransition(() => {
      setDateFilter(date);
      setActiveDateFilter(date);
      setViewMode("list");
    });
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
    setFormAllDay(false);
    setFormNote("");
    setFormMenuItems([]);
    setFormAmount(0);
    setMenuQuery("");
    setMenuCategory(null);
    setSaveMsg(null);
    setFormStep(1);
    setNeedsLoaner(false);
    setConsiderStaff(true);
    setCandidates(null);
    setCandidatesErr(null);
    setTaskTemplateId("");
    setFormLoanerId("");
    setFormWorkflowStarted(false);
  };

  const openCreateForm = () => {
    startFormTransition(() => {
      resetForm();
      setShowForm(true);
    });
    fetchVehicles();
  };

  const openEditForm = (r: Reservation) => {
    startFormTransition(() => {
      setEditingId(r.id);
      setFormTitle(r.title);
      setFormCustomerId(r.customer_id ?? "");
      setFormVehicleId(r.vehicle_id ?? "");
      setFormDate(r.scheduled_date);
      setFormStartTime(r.start_time?.slice(0, 5) ?? "");
      setFormEndTime(r.end_time?.slice(0, 5) ?? "");
      setFormAllDay(r.all_day ?? false);
      setFormNote(r.note ?? "");
      setFormMenuItems(r.menu_items_json ?? []);
      setFormAmount(r.estimated_amount ?? 0);
      setMenuQuery("");
      setMenuCategory(null);
      setTaskTemplateId(r.workflow_template_id ?? "");
      setFormLoanerId(r.loaner_car_id ?? "");
      setFormWorkflowStarted(!!r.current_step_key || r.current_step_order > 0 || r.progress_pct > 0);
      setSaveMsg(null);
      setFormStep(1);
      setShowForm(true);
    });
    if (r.customer_id) fetchVehicles(r.customer_id);
    else fetchVehicles();
  };

  // 選択品目と見積金額をまとめて更新（toggle / 解除で共有）。
  const applyMenuItems = (next: MenuItem[]) => {
    setFormMenuItems(next);
    setFormAmount(next.reduce((sum, m) => sum + m.price, 0));
  };

  const toggleMenuItem = (mi: MenuItemMaster) => {
    const exists = formMenuItems.find((m) => m.menu_item_id === mi.id);
    applyMenuItems(
      exists
        ? formMenuItems.filter((m) => m.menu_item_id !== mi.id)
        : [...formMenuItems, { menu_item_id: mi.id, name: mi.name, price: mi.unit_price }],
    );
  };

  // 品目の絞り込み（大カテゴリ + 検索）。選択済み（formMenuItems）は絞り込みに関わらず保持される。
  const menuCategories = useMemo(() => menuCategoriesOf(menuItems), [menuItems]);
  const filteredMenuItems = useMemo(
    () => filterMenuItems(menuItems, menuQuery, menuCategory),
    [menuItems, menuQuery, menuCategory],
  );

  // 選択メニューの推定作業時間（品目マスタ estimated_minutes の合計）。無ければ null。
  const selectedEstMinutes = useMemo(() => {
    const items = formMenuItems
      .map((m) => menuItems.find((mi) => mi.id === m.menu_item_id))
      .filter((mi): mi is MenuItemMaster => !!mi)
      .map((mi) => ({ estimated_minutes: mi.estimated_minutes }));
    return estimateReservationMinutes(items);
  }, [formMenuItems, menuItems]);

  // 作業タスクの分解元: 工程テンプレート選択時はその工程(steps)、未選択時は品目から。
  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === taskTemplateId) ?? null,
    [templates, taskTemplateId],
  );

  // 「品目から自動」時に、選択メニューの大カテゴリと service_type が一致する工程テンプレを提案。
  const matchedTemplate = useMemo(() => {
    if (taskTemplateId) return null; // 手動選択済みなら提案しない
    const cats = formMenuItems
      .map((m) => menuItems.find((mi) => mi.id === m.menu_item_id)?.category_large)
      .filter((c): c is string => !!c && c.trim().length > 0)
      .map((c) => c.trim().toLowerCase());
    if (cats.length === 0) return null;
    return (
      templates.find((t) => {
        const st = (t.service_type ?? "").trim().toLowerCase();
        if (!st) return false;
        return cats.some((c) => c === st || c.includes(st) || st.includes(c));
      }) ?? null
    );
  }, [taskTemplateId, formMenuItems, menuItems, templates]);
  const taskPlan = useMemo(() => {
    const items = selectedTemplate
      ? [...selectedTemplate.steps]
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ name: s.label, minutes: s.estimated_min }))
      : formMenuItems.map((m) => ({
          name: m.name,
          minutes: menuItems.find((mi) => mi.id === m.menu_item_id)?.estimated_minutes ?? null,
        }));
    return decomposeTasks(items);
  }, [selectedTemplate, formMenuItems, menuItems]);

  // 推定作業時間を開始時刻に足して終了時刻へ反映する。開始未設定なら 09:00 を既定に。
  function applyEstimatedDuration() {
    if (selectedEstMinutes == null) return;
    const start = formStartTime || "09:00";
    const [h, m] = start.split(":").map(Number);
    // ponytail: 日跨ぎ枠は想定外のため 23:59 で頭打ち（当日内作業の前提）。
    const endMin = Math.min((h || 0) * 60 + (m || 0) + selectedEstMinutes, 24 * 60 - 1);
    if (!formStartTime) setFormStartTime(start);
    setFormEndTime(`${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`);
  }

  // 受けられる日程候補を取得（作業内容の所要時間＋代車の空きを加味）。
  async function fetchCandidates() {
    setCandidatesLoading(true);
    setCandidatesErr(null);
    try {
      const params = new URLSearchParams();
      const ids = formMenuItems.map((m) => m.menu_item_id).join(",");
      if (ids) params.set("menu_item_ids", ids);
      // 工程テンプレート選択時はその工程合計時間を所要時間として明示（品目由来より優先）。
      if (selectedTemplate && taskPlan.totalMinutes > 0) {
        params.set("estimated_minutes", String(taskPlan.totalMinutes));
      }
      // 品目が無くテンプレのみ＝作業カテゴリが取れないため、受入制限枠は除外する。
      if (selectedTemplate && formMenuItems.length === 0) {
        params.set("exclude_restricted", "1");
      }
      if (needsLoaner) params.set("needs_loaner", "1");
      if (!considerStaff) params.set("consider_staff", "0");
      params.set("days", "21");
      const res = await fetch(`/api/admin/booking-candidates?${params.toString()}`);
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
      setCandidates((j?.candidates ?? []) as BookingCandidate[]);
    } catch (e: unknown) {
      setCandidatesErr(e instanceof Error ? e.message : String(e));
      setCandidates(null);
    } finally {
      setCandidatesLoading(false);
    }
  }

  // 候補を選んで日時フォームに反映。
  function pickCandidate(c: BookingCandidate) {
    setFormDate(c.date);
    setFormStartTime(c.start_time);
    setFormEndTime(c.end_time);
    setSaveMsg({ text: `日時を ${c.date} ${c.start_time}〜${c.end_time} に設定しました`, ok: true });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    const payload: Record<string, unknown> = {
      title: formTitle,
      customer_id: formCustomerId || null,
      vehicle_id: formVehicleId || null,
      scheduled_date: formDate,
      all_day: formAllDay,
      start_time: formAllDay ? null : formStartTime || null,
      end_time: formAllDay ? null : formEndTime || null,
      note: formNote || null,
      menu_items_json: formMenuItems,
      estimated_amount: formAmount,
      workflow_template_id: taskTemplateId || null,
      loaner_car_id: formLoanerId || null,
    };
    if (editingId) payload.id = editingId;
    try {
      const res = await fetch("/api/admin/reservations", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await parseJsonSafe(res);
      if (!res.ok) throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
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
        const j = await parseJsonSafe(res);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
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
        const j = await parseJsonSafe(res);
        throw new Error(j?.message ?? j?.error ?? `HTTP ${res.status}`);
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

  const grouped = useMemo(
    () =>
      reservations.reduce<Record<string, Reservation[]>>((acc, r) => {
        if (!acc[r.scheduled_date]) acc[r.scheduled_date] = [];
        acc[r.scheduled_date].push(r);
        return acc;
      }, {}),
    [reservations],
  );
  const sortedDates = useMemo(() => Object.keys(grouped).sort(), [grouped]);

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
          <div className="flex items-center gap-2">
            <Link
              href="/admin/jobs/new"
              className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent-dim px-4 py-2 text-sm font-semibold text-accent-text hover:bg-accent/10 transition-colors"
              title="予約なしで来店された案件を即座に開始"
            >
              🏃 飛び込み案件
            </Link>
            <button
              onClick={openCreateForm}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-accent transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              新規予約
            </button>
          </div>
        }
      />

      {/* ── Gcal feedback ── */}
      {gcalFeedback === "connected" && (
        <div className="rounded-xl border border-accent/30 bg-accent-dim p-3 text-sm text-accent-text">
          ✅ Googleカレンダーとの連携が完了しました！
        </div>
      )}
      {gcalFeedback === "error" && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim p-3 text-sm text-danger-text">
          ❌ Googleカレンダーの連携に失敗しました。再度お試しください。
        </div>
      )}

      {err && (
        <div className="rounded-xl border border-danger/20 bg-danger-dim p-3 text-sm text-danger-text">{err}</div>
      )}

      {stats?.total === 0 && !showForm && (
        <EmptyStateGuide
          icon="📅"
          title="最初の予約を登録しましょう"
          description="予約を登録すると、来店時のチェックイン・作業進捗・証明書発行・請求までを1つの案件として一気通貫で管理できます。"
          steps={[
            {
              title: "「+ 新規予約」をクリック",
              description: "右上のボタンから入力フォームを開きます。",
            },
            {
              title: "日時・顧客・車両を入力",
              description: "日時、顧客、車両、施工メニューを設定。Googleカレンダーとも連携できます。",
            },
            {
              title: "予約 → 案件ワークフローへ",
              description:
                "予約から「案件ワークフロー」を開くと、チェックイン → 作業 → 完了 → 請求までを案内に沿って進められます。",
            },
          ]}
          primaryAction={{ label: "+ 最初の予約を登録", onClick: openCreateForm }}
          secondaryAction={{ label: "🏃 飛び込み案件で開始", href: "/admin/jobs/new" }}
        />
      )}

      {/* ── Stats cards ── */}
      {presentation.showStatsCards ? (
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
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-border-subtle bg-surface px-4 py-2 text-xs text-secondary">
          <span>
            本日 <strong className="text-primary">{stats?.today_count ?? 0}件</strong>
          </span>
          <span>
            進行中 <strong className="text-primary">{stats?.active_count ?? 0}件</strong>
          </span>
          <span>
            総予約 <strong className="text-primary">{stats?.total ?? 0}件</strong>
          </span>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* View toggle */}
        <div className="flex rounded-xl border border-border-subtle overflow-hidden shadow-sm">
          {(["list", "calendar"] as const).map((m) => (
            <button
              key={m}
              onClick={() => startFilterTransition(() => setViewMode(m))}
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
            {!dateFilter && (
              <button
                onClick={() => setShowPast((v) => !v)}
                className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors shadow-sm ${
                  showPast
                    ? "border-accent/30 bg-accent-dim text-accent-text"
                    : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
                }`}
              >
                過去の予約{showPast ? "を隠す" : "も表示"}
              </button>
            )}
          </div>
        )}

        {/* Booking URL share button */}
        {tenantSlug && (
          <button
            onClick={() => setShowBookingUrlPanel(!showBookingUrlPanel)}
            className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors shadow-sm ${
              showBookingUrlPanel
                ? "border-accent/30 bg-accent-dim text-accent-text"
                : "border-border-subtle bg-surface text-secondary hover:bg-surface-hover"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L5.25 9.75"
              />
            </svg>
            予約ページ共有
          </button>
        )}

        {/* Gcal button */}
        <button
          onClick={() => setShowGcalPanel(!showGcalPanel)}
          className={`${!tenantSlug ? "ml-auto " : ""}flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors shadow-sm ${
            gcalConnected
              ? "border-accent/30 bg-accent-dim text-accent-text"
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

      {/* ── Booking URL panel (collapsible) ── */}
      {showBookingUrlPanel && tenantSlug && (
        <section className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-primary">予約ページURL</div>
              <div className="text-xs text-muted mt-0.5">
                このURLをお客様に共有すると、オンラインで予約を受け付けられます
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/customer/${encodeURIComponent(tenantSlug)}/booking`}
              className="flex-1 rounded-xl border border-border-default bg-inset px-3 py-2.5 text-sm text-primary font-mono select-all"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={async () => {
                const url = `${window.location.origin}/customer/${encodeURIComponent(tenantSlug)}/booking`;
                await navigator.clipboard.writeText(url);
                setBookingUrlCopied(true);
                setTimeout(() => setBookingUrlCopied(false), 2000);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent transition-colors whitespace-nowrap"
            >
              {bookingUrlCopied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  コピー済み
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
                    />
                  </svg>
                  URLをコピー
                </>
              )}
            </button>
          </div>
        </section>
      )}

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
                        const syncJ = await parseJsonSafe(syncRes);
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
                      const j = await parseJsonSafe(res);
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
            <div className="pt-2 border-t border-border space-y-2">
              {/* 予約の書き込み先＝メイン（full 読み取りも兼ねる） */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted whitespace-nowrap">予約の書き込み先:</label>
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
              </div>

              {/* 追加カレンダー（衝突チェック用・書き込み先以外）。個人予定は「予定あり(非公開)」で名前を隠せる。 */}
              {gcalCalendars.filter((c) => c.id !== (gcalCalendarId ?? "primary")).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">
                    他のカレンダーもダブルブッキング防止に使う（個人予定は「予定あり(非公開)」で名前を隠せます）:
                  </p>
                  {gcalCalendars
                    .filter((c) => c.id !== (gcalCalendarId ?? "primary"))
                    .map((c) => {
                      const mode = gcalReadCalendars.find((r) => r.id === c.id)?.mode ?? "off";
                      return (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className="text-xs text-primary flex-1 truncate">
                            {c.summary}
                            {c.primary ? " (メイン)" : ""}
                          </span>
                          <select
                            value={mode}
                            onChange={async (e) => {
                              const m = e.target.value as "off" | "full" | "busy";
                              const next = gcalReadCalendars.filter((r) => r.id !== c.id);
                              if (m !== "off") next.push({ id: c.id, mode: m });
                              setGcalReadCalendars(next);
                              setGcalCalendarSaving(true);
                              await fetch("/api/admin/gcal", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ action: "set-read-calendars", read_calendars: next }),
                              });
                              setGcalCalendarSaving(false);
                            }}
                            disabled={gcalCalendarSaving}
                            className="text-xs border border-border rounded px-2 py-1 bg-background text-primary"
                          >
                            <option value="off">使わない</option>
                            <option value="full">内容も同期</option>
                            <option value="busy">予定あり(非公開)</option>
                          </select>
                        </div>
                      );
                    })}
                </div>
              )}
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
          {resultTotal > reservations.length && (
            <div className="rounded-xl border border-border-subtle bg-inset px-4 py-3 text-xs text-secondary">
              先頭{reservations.length}件を表示しています。日付や状態で絞り込んでください。
            </div>
          )}
          {reservations.length === 0 ? (
            <div className="glass-card p-12 text-center">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-sm text-muted">条件に一致する予約がありません。</p>
              <button onClick={openCreateForm} className="mt-4 btn-primary text-sm px-5 py-2">
                新規予約を作成
              </button>
            </div>
          ) : (
            <div className={isDense ? "space-y-2" : "space-y-4"}>
              {sortedDates.map((date) => {
                const isToday = date === today;
                const dayReservations = grouped[date];
                return (
                  <div key={date}>
                    {/* Date header */}
                    <div className={`flex items-center gap-2 px-1 ${isDense ? "mb-1" : "mb-2"}`}>
                      <span
                        className={`inline-flex items-center gap-1.5 font-bold tracking-wide rounded-full ${isDense ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs"} ${
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
                    <div className={isDense ? "space-y-1" : "space-y-2"}>
                      {dayReservations.map((r) => {
                        const c = cfg(r.status);
                        const next = nextStatus(r.status);
                        return (
                          <div
                            key={r.id}
                            className={`${isDense ? "overflow-hidden rounded-lg border border-border-subtle bg-surface" : "glass-card overflow-hidden transition-shadow hover:shadow-md"} ${
                              r.status === "cancelled" ? "opacity-60" : ""
                            }`}
                          >
                            {/* Status color bar */}
                            <div className={`${isDense ? "h-0.5" : "h-1"} w-full ${c.dot}`} />

                            <div className={isDense ? "px-3 py-2" : "p-4"}>
                              <div className="flex items-start gap-3">
                                {/* Left: info */}
                                <div className="min-w-0 flex-1">
                                  <div
                                    className={`flex flex-wrap items-center ${isDense ? "gap-1.5 mb-0.5" : "gap-2 mb-1.5"}`}
                                  >
                                    {/* Status badge */}
                                    <span
                                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${c.bg} ${c.text}`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                                      {c.label}
                                    </span>
                                    {/* Time / 終日 */}
                                    {r.all_day ? (
                                      <span className="text-xs font-semibold text-primary bg-surface-hover rounded-full px-2.5 py-0.5">
                                        📅 終日
                                      </span>
                                    ) : (
                                      r.start_time && (
                                        <span className="text-xs font-semibold text-primary bg-surface-hover rounded-full px-2.5 py-0.5">
                                          {r.start_time.slice(0, 5)}
                                          {r.end_time && ` – ${r.end_time.slice(0, 5)}`}
                                        </span>
                                      )
                                    )}
                                    {/* Mini progress bar for workflow-enabled reservations */}
                                    {r.workflow_template_id && !isDense && (
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

                                  {/* Title — clickable link to the dedicated job/workflow page */}
                                  <Link
                                    href={`/admin/jobs/${r.id}`}
                                    className={`block font-bold text-primary hover:text-accent hover:underline transition-colors ${isDense ? "text-xs mb-0.5" : "text-sm mb-1"}`}
                                    title="案件ワークフローを開く"
                                  >
                                    {r.title}
                                  </Link>

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
                                    {r.estimated_amount > 0 && !isDense && (
                                      <span className="font-semibold text-primary">
                                        {formatJpy(r.estimated_amount)}
                                      </span>
                                    )}
                                  </div>

                                  {r.note && !isDense && (
                                    <p className="mt-1.5 text-xs text-muted bg-surface-hover rounded-lg px-2.5 py-1.5 truncate max-w-sm">
                                      💬 {r.note}
                                    </p>
                                  )}
                                  {r.cancel_reason && (
                                    <p className="mt-1 text-xs text-danger">キャンセル理由: {r.cancel_reason}</p>
                                  )}
                                </div>

                                {/* Right: actions */}
                                <div
                                  className={`flex items-end shrink-0 ${isDense ? "flex-row gap-1" : "flex-col gap-1.5"}`}
                                >
                                  {/* Open dedicated job workflow page */}
                                  <Link
                                    href={`/admin/jobs/${r.id}`}
                                    className={`font-semibold rounded-lg border border-accent/30 bg-accent-dim text-accent-text hover:bg-accent/10 transition-colors whitespace-nowrap ${isDense ? "px-2 py-1 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
                                    title="案件ワークフローを別画面で開く"
                                  >
                                    {isDense ? "開く" : "🧭 案件を開く"}
                                  </Link>
                                  {/* Quick actions toggle (edit / cancel / delete) — inline expando, not a workflow view */}
                                  <button
                                    onClick={() => setDetailId(detailId === r.id ? null : r.id)}
                                    className={`${isDense ? "text-[10px]" : "text-[11px]"} text-muted hover:text-primary px-2 py-1 rounded-lg hover:bg-surface-hover transition-colors`}
                                  >
                                    操作 {detailId === r.id ? "▲" : "▼"}
                                  </button>

                                  {/* Next status button */}
                                  {next && r.status !== "cancelled" && (
                                    <button
                                      onClick={() => handleStatusChange(r.id, next)}
                                      className={`${isDense ? "text-[10px] px-2 py-1" : "text-[11px] px-3 py-1.5"} font-semibold rounded-lg transition-colors ${cfg(next).bg} ${cfg(next).text} hover:opacity-80`}
                                    >
                                      {cfg(next).label}へ →
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Quick actions panel (edit / cancel / delete) */}
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
                          value={formAllDay ? "" : formStartTime}
                          onChange={(e) => setFormStartTime(e.target.value)}
                          disabled={formAllDay}
                          className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                        />
                      </label>
                      <label className={labelCls}>
                        <span className={labelTextCls}>終了</span>
                        <input
                          type="time"
                          value={formAllDay ? "" : formEndTime}
                          onChange={(e) => setFormEndTime(e.target.value)}
                          disabled={formAllDay}
                          className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                        />
                      </label>
                    </div>

                    {/* 終日予約（時間指定なし・1日お預かり） */}
                    <label className="flex items-center gap-2 cursor-pointer select-none -mt-1">
                      <input
                        type="checkbox"
                        checked={formAllDay}
                        onChange={(e) => {
                          setFormAllDay(e.target.checked);
                          if (e.target.checked) {
                            setFormStartTime("");
                            setFormEndTime("");
                          }
                        }}
                        className="h-4 w-4 rounded border-border-default text-accent focus:ring-accent/30"
                      />
                      <span className="text-sm text-secondary">終日（時間指定なし・1日お預かり）</span>
                    </label>

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

                    {/* 代車の割当（指定日の代車空きに反映） */}
                    {loaners.length > 0 && (
                      <label className={labelCls}>
                        <span className={labelTextCls}>代車</span>
                        <select
                          value={formLoanerId}
                          onChange={(e) => setFormLoanerId(e.target.value)}
                          className={inputCls}
                        >
                          <option value="">なし</option>
                          {loaners.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.plate_display ? `${l.name} / ${l.plate_display}` : l.name}
                            </option>
                          ))}
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
                        <div className="flex items-center justify-between gap-2">
                          <span className={labelTextCls}>メニュー</span>
                          {formMenuItems.length > 0 && (
                            <span className="text-[11px] text-muted">選択中 {formMenuItems.length}件</span>
                          )}
                        </div>
                        {/* 選択済み品目は一覧の表示状態に関わらず常に見えるようにする（✕で解除） */}
                        {formMenuItems.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {formMenuItems.map((m) => (
                              <button
                                key={m.menu_item_id}
                                type="button"
                                onClick={() =>
                                  applyMenuItems(formMenuItems.filter((x) => x.menu_item_id !== m.menu_item_id))
                                }
                                className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-dim px-3 py-1 text-[11px] font-medium text-accent-text"
                              >
                                {m.name} ✕
                              </button>
                            ))}
                          </div>
                        )}
                        {/* 品目が多いと一覧が縦に伸びるため、検索とカテゴリで絞り込む */}
                        <input
                          type="text"
                          value={menuQuery}
                          onChange={(e) => setMenuQuery(e.target.value)}
                          placeholder="品目を検索..."
                          className={`${inputCls} mt-2`}
                        />
                        {menuCategories.length > 1 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setMenuCategory(null)}
                              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                                menuCategory === null
                                  ? "border-accent bg-accent-dim text-accent-text"
                                  : "border-border-default bg-surface text-secondary hover:border-border-strong"
                              }`}
                            >
                              すべて
                            </button>
                            {menuCategories.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setMenuCategory(c)}
                                className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                                  menuCategory === c
                                    ? "border-accent bg-accent-dim text-accent-text"
                                    : "border-border-default bg-surface text-secondary hover:border-border-strong"
                                }`}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        )}
                        {/* POSレジ風に、常にカテゴリタブ＋グリッドで一覧表示（縦積みのピルをやめ、
                            マス目状に並べて選びやすくする）。選択済みは枠色＋✓で示す。 */}
                        <div className="mt-2 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                          {filteredMenuItems.map((mi) => {
                            const selected = formMenuItems.some((m) => m.menu_item_id === mi.id);
                            return (
                              <button
                                key={mi.id}
                                type="button"
                                onClick={() => toggleMenuItem(mi)}
                                className={`relative rounded-xl border p-2.5 text-left transition-all ${
                                  selected
                                    ? "border-accent bg-accent-dim text-accent-text shadow-sm"
                                    : "border-border-default bg-surface text-secondary hover:border-border-strong"
                                }`}
                              >
                                <div className="text-xs font-medium leading-tight">{mi.name}</div>
                                <div className="mt-1 text-[11px] font-semibold opacity-80">
                                  {formatJpy(mi.unit_price)}
                                </div>
                                {selected && (
                                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                                    ✓
                                  </span>
                                )}
                              </button>
                            );
                          })}
                          {filteredMenuItems.length === 0 && (
                            <div className="col-span-full py-2 text-xs text-muted">該当する品目がありません</div>
                          )}
                        </div>
                        {formAmount > 0 && (
                          <div className="mt-3 flex items-center justify-between bg-accent-dim border border-accent/20 rounded-xl px-4 py-2.5">
                            <span className="text-xs text-accent-text font-medium">見積金額</span>
                            <span className="text-base font-bold text-accent-text">{formatJpy(formAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 所要時間・タスク分解・日程候補（品目が無くても工程テンプレートから利用可能） */}
                    <div>
                      {selectedEstMinutes != null && (
                        <div className="mt-2 flex items-center justify-between gap-3 bg-inset border border-border-default rounded-xl px-4 py-2.5">
                          <div className="min-w-0">
                            <span className="text-xs text-secondary">推定作業時間（品目マスタ）</span>
                            <div className="text-sm font-bold text-primary">{formatMinutes(selectedEstMinutes)}</div>
                          </div>
                          <button
                            type="button"
                            onClick={applyEstimatedDuration}
                            className="shrink-0 rounded-lg border border-accent bg-surface px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent-dim transition-colors"
                          >
                            終了時刻に反映
                          </button>
                        </div>
                      )}

                      {/* 作業タスクの分解と日程目安（工程テンプレート展開） */}
                      {(templates.length > 0 || taskPlan.tasks.length > 0) && (
                        <div className="mt-2 rounded-xl border border-border-default bg-inset p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-primary">作業タスクと日程目安</span>
                            {taskPlan.tasks.length > 0 && (
                              <span className="text-[11px] text-secondary">
                                合計 {formatMinutes(taskPlan.totalMinutes)}
                                {taskPlan.dayCount > 1 && ` ・ 約${taskPlan.dayCount}日`}
                              </span>
                            )}
                          </div>
                          {templates.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-[11px] text-secondary shrink-0">工程テンプレート</span>
                              <select
                                value={taskTemplateId}
                                onChange={(e) => setTaskTemplateId(e.target.value)}
                                disabled={formWorkflowStarted}
                                className={`${inputCls} py-1 text-xs disabled:opacity-60`}
                              >
                                <option value="">品目から自動</option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              {formWorkflowStarted && (
                                <span className="text-[10px] text-muted shrink-0">開始後は変更不可</span>
                              )}
                            </div>
                          )}
                          {matchedTemplate && !formWorkflowStarted && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-secondary">
                              <span>
                                作業内容から「<b className="text-primary">{matchedTemplate.name}</b>」工程に一致します。
                              </span>
                              <button
                                type="button"
                                onClick={() => setTaskTemplateId(matchedTemplate.id)}
                                className="shrink-0 rounded-md border border-accent px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent-dim transition-colors"
                              >
                                適用
                              </button>
                            </div>
                          )}
                          {taskPlan.tasks.length === 0 ? (
                            <p className="mt-2 text-[11px] text-muted">
                              品目を選ぶか工程テンプレートを指定すると、作業タスクと日程目安が表示されます。
                            </p>
                          ) : (
                            <>
                              <ul className="mt-2 space-y-1">
                                {taskPlan.tasks.map((t, i) => (
                                  <li
                                    key={`${t.name}-${i}`}
                                    className="flex items-center justify-between gap-2 text-xs text-secondary"
                                  >
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <span className="shrink-0 text-[10px] text-accent-text bg-accent-dim rounded px-1.5 py-0.5">
                                        {taskPlan.dayCount > 1 ? `${t.day}日目` : "当日"}
                                      </span>
                                      <span className="truncate text-primary">{t.name}</span>
                                    </span>
                                    <span className="shrink-0 text-muted">{formatMinutes(t.minutes)}</span>
                                  </li>
                                ))}
                              </ul>
                              {taskPlan.dayCount > 1 && (
                                <p className="mt-2 text-[11px] text-muted">
                                  1日8時間を目安に分割した概算です。下の「受けられる日程を提案」で連続した空き日を確認できます。
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* 受けられる日程候補の提案 */}
                      <div className="mt-3 rounded-xl border border-border-default bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-primary">受けられる日程を提案</span>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={considerStaff}
                                onChange={(e) => setConsiderStaff(e.target.checked)}
                                className="rounded border-border-default text-accent focus:ring-accent/30"
                              />
                              人手の空きを考慮
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={needsLoaner}
                                onChange={(e) => setNeedsLoaner(e.target.checked)}
                                className="rounded border-border-default text-accent focus:ring-accent/30"
                              />
                              代車が必要
                            </label>
                            <button
                              type="button"
                              onClick={fetchCandidates}
                              disabled={candidatesLoading}
                              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
                            >
                              {candidatesLoading ? "検索中…" : "候補を探す"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          作業内容の所要時間・受付枠の空き・定休日{needsLoaner ? "・代車の空き" : ""}を加味して、
                          今日から3週間ぶんの受けられる日時を提案します。
                        </p>
                        {candidatesErr && <p className="mt-2 text-xs text-danger">{candidatesErr}</p>}
                        {candidates != null && candidates.length === 0 && !candidatesErr && (
                          <p className="mt-2 text-xs text-muted">条件に合う空き日程が見つかりませんでした。</p>
                        )}
                        {candidates != null && candidates.length > 0 && (
                          <div className="mt-2 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                            {candidates.map((c, i) => (
                              <button
                                key={`${c.date}-${c.start_time}-${i}`}
                                type="button"
                                onClick={() => pickCandidate(c)}
                                className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-inset px-3 py-2 text-left hover:border-accent hover:bg-accent-dim transition-colors"
                              >
                                <span className="text-sm font-medium text-primary">
                                  {c.date.slice(5).replace("-", "/")}（{WEEKDAY_JA[c.day_of_week]}） {c.start_time}〜
                                  {c.end_time}
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0">
                                  {c.accepted_categories && c.accepted_categories.length > 0 && (
                                    <span className="text-[10px] text-accent-text bg-accent-dim rounded px-1.5 py-0.5">
                                      {c.accepted_categories.join("・")}
                                    </span>
                                  )}
                                  {!c.fits && (
                                    <span className="text-[10px] font-medium text-warning bg-warning-dim rounded px-1.5 py-0.5">
                                      枠超過
                                    </span>
                                  )}
                                  {c.staff_free != null && (
                                    <span className="text-[10px] text-secondary">人手{c.staff_free}</span>
                                  )}
                                  {c.loaner_free != null && (
                                    <span className="text-[10px] text-secondary">代車{c.loaner_free}台</span>
                                  )}
                                  <span className="text-[10px] text-muted">残{c.remaining}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

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
                    {canAiNote && (
                      <VoiceMemoPanel
                        variant="note"
                        onApply={(note) => setFormNote((prev) => (prev.trim() ? `${prev.trim()}\n${note}` : note))}
                      />
                    )}

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
    </div>
  );
}
