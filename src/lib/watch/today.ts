export const WATCH_ACTIVE_STATUSES = ["confirmed", "arrived", "in_progress"] as const;

export type WatchActiveStatus = (typeof WATCH_ACTIVE_STATUSES)[number];

type Relation<T> = T | T[] | null;

export type WatchReservationRow = {
  id: string;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  status: string;
  workflow_template_id: string | null;
  current_step_key: string | null;
  current_step_order: number | null;
  progress_pct: number | null;
  workflow_templates: Relation<{ steps: unknown }>;
  reservation_step_logs: Array<{
    step_order: number;
    step_label: string | null;
    started_at: string | null;
    completed_at: string | null;
  }> | null;
  customers: Relation<{ name: string | null }>;
  vehicles: Relation<{
    maker: string | null;
    model: string | null;
    plate_display: string | null;
  }>;
};

export type WatchJob = {
  id: string;
  title: string;
  scheduledDate: string;
  startTime: string | null;
  status: WatchActiveStatus;
  statusLabel: string;
  customerName: string;
  vehicleLabel: string;
  plate: string;
  currentStep: string | null;
  progress: number;
  actionLabel: string;
  expectedEndAt: string | null;
  overdueMinutes: number;
};

type WorkflowStep = { order: number; key?: string; label?: string; estimated_min?: number };

function one<T>(value: Relation<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function statusLabel(status: WatchActiveStatus): string {
  if (status === "confirmed") return "予約";
  if (status === "arrived") return "来店";
  return "作業中";
}

function workflowSteps(row: WatchReservationRow): WorkflowStep[] {
  const template = one(row.workflow_templates);
  if (!template || !Array.isArray(template.steps)) return [];
  return template.steps.filter(
    (step): step is WorkflowStep =>
      !!step && typeof step === "object" && typeof (step as { order?: unknown }).order === "number",
  );
}

function actionLabel(row: WatchReservationRow, steps: WorkflowStep[]): string {
  if (row.workflow_template_id) {
    const lastOrder = Math.max(0, ...steps.map((step) => step.order));
    if (lastOrder > 0 && (row.current_step_order ?? 0) >= lastOrder) return "作業完了";
    return row.status === "confirmed" && (row.current_step_order ?? 0) === 0 ? "来店受付" : "次の工程へ";
  }
  if (row.status === "confirmed") return "来店受付";
  if (row.status === "arrived") return "作業開始";
  return "作業完了";
}

/**
 * Apple Watch に必要な情報だけへ縮約する。
 * DB 行をそのまま返さず、画面表示と1タップ操作に不要な情報を落とす。
 */
export function toWatchJob(row: WatchReservationRow, now: Date = new Date()): WatchJob | null {
  if (!WATCH_ACTIVE_STATUSES.includes(row.status as WatchActiveStatus)) return null;

  const status = row.status as WatchActiveStatus;
  const customer = one(row.customers);
  const vehicle = one(row.vehicles);
  const vehicleName = [vehicle?.maker, vehicle?.model].filter(Boolean).join(" ");
  const steps = workflowSteps(row);
  const currentOrder = row.current_step_order ?? 0;
  const currentLog = (row.reservation_step_logs ?? []).find(
    (log) => log.step_order === currentOrder && !log.completed_at,
  );
  const currentDefinition = steps.find((step) => step.order === currentOrder);
  const estimatedMinutes = Math.max(0, currentDefinition?.estimated_min ?? 0);
  const startedAt = currentLog?.started_at ? new Date(currentLog.started_at) : null;
  const expectedEnd =
    startedAt && !Number.isNaN(startedAt.getTime()) && estimatedMinutes > 0
      ? new Date(startedAt.getTime() + estimatedMinutes * 60_000)
      : null;
  const overdueMinutes = expectedEnd ? Math.max(0, Math.floor((now.getTime() - expectedEnd.getTime()) / 60_000)) : 0;

  return {
    id: row.id,
    title: row.title?.trim() || "作業",
    scheduledDate: row.scheduled_date,
    startTime: row.start_time?.slice(0, 5) || null,
    status,
    statusLabel: statusLabel(status),
    customerName: customer?.name?.trim() || "顧客未登録",
    vehicleLabel: vehicleName || "車両未登録",
    plate: vehicle?.plate_display?.trim() || "ナンバー未登録",
    currentStep:
      currentLog?.step_label?.trim() || currentDefinition?.label?.trim() || row.current_step_key?.trim() || null,
    progress: Math.max(0, Math.min(100, row.progress_pct ?? (status === "in_progress" ? 50 : 0))),
    actionLabel: actionLabel(row, steps),
    expectedEndAt: expectedEnd?.toISOString() ?? null,
    overdueMinutes,
  };
}
