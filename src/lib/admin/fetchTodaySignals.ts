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
import { cache } from "react";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { deriveTodayTasks, type TaskTile } from "@/lib/admin/todayTasks";
import { businessDateString } from "@/lib/datetime";

export { businessDateString } from "@/lib/datetime";

/**
 * 「営業日」の日付文字列 (YYYY-MM-DD) を JST で返す。
 *
 * 日次サマリの保存キー (digest_date) と読取キーを JST で統一するために使う。
 * cron は UTC で発火するため、UTC 日付を使うと日付の繰り上がりで保存済みサマリが
 * 日中に消える。Ledra は国内向けなので JST (UTC+9・DST なし) を営業日とする。
 * ponytail: 店舗別タイムゾーンには未対応 (全店 JST 前提)。海外展開時に店舗 tz を持つ。
 */
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
 *
 * ponytail: 同一リクエスト内で TodayOverviewSection と TodayTasksWidget が同じ
 * (tenantId, scope, currentUserId) で呼ぶため、内部を React cache() でラップし
 * 二重フェッチを防ぐ。cache() は引数を参照ではなく値で比較するため、呼び出し側
 * ごとに新しく作る opts オブジェクトのままだと効かない — プリミティブ引数の
 * 内部実装を挟むのはそのため。
 */
export async function fetchTodaySignals(
  tenantId: string,
  opts?: { scope?: "tenant" | "mine"; currentUserId?: string | null; now?: Date },
): Promise<TodaySignals> {
  return fetchTodaySignalsCached(tenantId, opts?.scope ?? "tenant", opts?.currentUserId ?? null, opts?.now?.getTime());
}

const fetchTodaySignalsCached = cache(async function fetchTodaySignalsImpl(
  tenantId: string,
  scope: "tenant" | "mine",
  currentUserId: string | null,
  nowMs: number | undefined,
): Promise<TodaySignals> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const realNow = nowMs !== undefined ? new Date(nowMs) : new Date();
  // 「今日」は営業タイムゾーン (JST) で判定する。digest_date (businessDateString) と
  // 揃え、UTC 日付とのズレでダッシュボードのタイルと保存済みサマリが食い違うのを防ぐ。
  const jstNow = new Date(realNow.getTime() + 9 * 60 * 60 * 1000);
  const todayStr = jstNow.toISOString().slice(0, 10);
  const dormantCutoff = new Date(jstNow.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const effectiveScope = scope === "mine" && currentUserId ? "mine" : "tenant";

  let reservationsQ = admin
    .from("reservations")
    .select("id, status, scheduled_date, title")
    .eq("tenant_id", tenantId)
    .or(`status.eq.in_progress,scheduled_date.eq.${todayStr}`)
    .neq("status", "cancelled")
    .limit(200);
  if (effectiveScope === "mine" && currentUserId) {
    reservationsQ = reservationsQ.eq("assigned_user_id", currentUserId);
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
    now: jstNow,
  };
});

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

/**
 * 日次 cron が保存した当日の「今日のまとめ」を読む。無ければ null。
 * ダッシュボードはこれを優先し、無ければ描画時に決定論版へフォールバックする
 * (描画のたびに AI を呼ばない)。※保存値は cron 実行時点のスナップショット。
 */
export async function fetchStoredDailyDigest(
  tenantId: string,
  now?: Date,
): Promise<{ text: string; ai: boolean } | null> {
  const { admin } = createTenantScopedAdmin(tenantId);
  const dateStr = businessDateString(now);
  const { data } = await admin
    .from("tenant_daily_digests")
    .select("text, ai")
    .eq("tenant_id", tenantId)
    .eq("digest_date", dateStr)
    .maybeSingle<{ text: string; ai: boolean }>();
  return data ? { text: data.text, ai: data.ai } : null;
}
