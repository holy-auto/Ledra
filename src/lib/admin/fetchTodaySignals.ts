/**
 * 「今日のタスク」用シグナルのテナント横断取得。
 *
 * reservations / documents(請求) / certificates から deriveTodayTasks の入力を
 * 組み立てる純データ取得層。TodayTasksWidget (ダッシュボードカード) と
 * dailyDigest (店長向け日次サマリ) の双方から使い、クエリの二重定義を避ける。
 *
 * LLM は一切使わない — ここで確定した件数がそのまま「事実」になり、
 * サマリ生成 AI はこの数値を言い換えるだけ (AI が事実を作らないための土台)。
 */
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { deriveTodayTasks, type TaskTile } from "@/lib/admin/todayTasks";

export interface TodaySignals {
  reservations: Array<{ id: string; status: string | null; scheduled_date: string; title?: string | null }>;
  invoices: Array<{ id: string; status: string | null; total: number | null; due_date: string | null }>;
  certificates: Array<{ id: string; status: string | null; expiry_date: string | null }>;
  churnRiskCustomerCount: number;
  now: Date;
}

/**
 * テナントの当日シグナルを並列取得する。scope="mine" + currentUserId 指定時は
 * reservation 系のみ担当ユーザで絞る (請求・証明書は店全体のまま)。
 */
export async function fetchTodaySignals(
  tenantId: string,
  opts?: { scope?: "tenant" | "mine"; currentUserId?: string | null; now?: Date },
): Promise<TodaySignals> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const now = opts?.now ?? new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const dormantCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const effectiveScope = opts?.scope === "mine" && opts?.currentUserId ? "mine" : "tenant";

  let reservationsQ = admin
    .from("reservations")
    .select("id, status, scheduled_date, title")
    .eq("tenant_id", tenantId)
    .or(`status.eq.in_progress,scheduled_date.eq.${todayStr}`)
    .neq("status", "cancelled")
    .limit(200);
  if (effectiveScope === "mine" && opts?.currentUserId) {
    reservationsQ = reservationsQ.eq("assigned_user_id", opts.currentUserId);
  }

  const [reservationsRes, invoicesRes, certsRes, churnRes] = await Promise.all([
    reservationsQ,
    admin
      .from("documents")
      .select("id, status, total, due_date")
      .eq("tenant_id", tenantId)
      .in("doc_type", ["invoice", "consolidated_invoice"])
      .in("status", ["sent", "overdue"])
      .limit(200),
    admin
      .from("certificates")
      .select("id, status, expiry_date")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .not("expiry_date", "is", null)
      .gte("expiry_date", todayStr)
      .limit(200),
    admin
      .from("reservations")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .lt("scheduled_date", dormantCutoff)
      .limit(500),
  ]);

  const dormantCustomerIds = new Set((churnRes.data ?? []).map((r: { customer_id: string }) => r.customer_id));

  return {
    reservations: reservationsRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    certificates: certsRes.data ?? [],
    churnRiskCustomerCount: dormantCustomerIds.size,
    now,
  };
}

/** シグナルからタイル (決定論) を導く薄いラッパ。 */
export function tilesFromSignals(signals: TodaySignals): TaskTile[] {
  return deriveTodayTasks({
    reservations: signals.reservations,
    invoices: signals.invoices,
    certificates: signals.certificates,
    churnRiskCustomerCount: signals.churnRiskCustomerCount,
    now: signals.now,
  });
}
