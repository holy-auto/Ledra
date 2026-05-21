import Link from "next/link";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { deriveTodayTasks, type TaskTile } from "@/lib/admin/todayTasks";
import TodayTasksScopeToggle from "./TodayTasksScopeToggle";

/**
 * 「今日のタスク」ウィジェット (server component)。
 *
 * テナント全体の reservations / invoices / certificates から「今やるべきこと」
 * をカード化して並べる。LLM は使わず、deterministic な signals 抽出だけで動く
 * (deriveTodayTasks)。Suspense fallback として軽量スケルトンを別 export。
 *
 * scope="mine" の場合、reservation 関連タイル (作業中 / 本日来店) は現在ユーザに
 * 担当アサインされた件数だけに絞られる。請求・証明書の期限系タイルは個人に
 * 紐付かないためテナント全体のままとする (店全体の優先タスクなので)。
 */

const TONE_STYLE: Record<TaskTile["tone"], { ring: string; badge: string; iconBg: string; iconColor: string }> = {
  urgent: {
    ring: "border-red-400/40 hover:border-red-400/60",
    badge: "bg-red-400/15 text-red-400 border-red-400/30",
    iconBg: "bg-red-400/15",
    iconColor: "text-red-400",
  },
  warn: {
    ring: "border-warning/30 hover:border-warning/50",
    badge: "bg-warning-dim text-warning border-warning/30",
    iconBg: "bg-warning-dim",
    iconColor: "text-warning",
  },
  normal: {
    ring: "border-border-default hover:border-accent/40",
    badge: "bg-accent-dim text-accent border-accent/30",
    iconBg: "bg-accent-dim",
    iconColor: "text-accent",
  },
};

function tileIcon(id: TaskTile["id"]): string {
  switch (id) {
    case "in_progress_jobs":
      return "🔧";
    case "today_visits":
      return "🚪";
    case "overdue_invoices":
      return "💰";
    case "unpaid_invoices":
      return "🧾";
    case "expiring_certificates":
      return "⏳";
    case "churn_risk_customers":
      return "⚠️";
  }
}

export function TodayTasksWidgetSkeleton() {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-[0.18em] text-muted mb-3">今日のタスク</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-5 h-24 animate-pulse">
            <div className="h-3 w-1/3 bg-[rgba(0,0,0,0.06)] rounded mb-3" />
            <div className="h-6 w-1/4 bg-[rgba(0,0,0,0.06)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function TodayTasksWidget({
  tenantId,
  scope = "tenant",
  currentUserId = null,
}: {
  tenantId: string;
  scope?: "tenant" | "mine";
  currentUserId?: string | null;
}) {
  const { admin } = createTenantScopedAdmin(tenantId);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // 180 日前の日付文字列
  const dormantCutoff = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const effectiveScope = scope === "mine" && currentUserId ? "mine" : "tenant";

  // 並列取得。各クエリは LIMIT を強く効かせて、ダッシュボード描画コストを抑える。
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
    // 離反リスク: 最終来店 > 180 日かつアクティブ予約なしの顧客数
    // reservations テーブルから顧客 ID + max scheduled_date を取得し、
    // 180 日超のものを絞る。シンプルに client で件数だけ取る。
    admin
      .from("reservations")
      .select("customer_id")
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .lt("scheduled_date", dormantCutoff)
      .limit(500),
  ]);

  // 離反リスク顧客数: 上記クエリで来店があるが最終来店が 180 日超の顧客を
  // 重複排除して数える (簡易 heuristic。予約中顧客の除外は UI 側で案内のみ)
  const dormantCustomerIds = new Set((churnRes.data ?? []).map((r: { customer_id: string }) => r.customer_id));
  const churnRiskCustomerCount = dormantCustomerIds.size;

  const tiles = deriveTodayTasks({
    reservations: reservationsRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    certificates: certsRes.data ?? [],
    churnRiskCustomerCount,
    now: today,
  });

  const showToggle = currentUserId != null;
  const headerRow = (
    <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
      <h2 className="text-sm font-semibold tracking-[0.18em] text-muted">
        今日のタスク
        {effectiveScope === "mine" && <span className="ml-2 text-[11px] text-accent">(あなた担当のみ)</span>}
      </h2>
      {showToggle && <TodayTasksScopeToggle scope={effectiveScope} />}
    </div>
  );

  // タスク 0 件のときも空のセクションは出さず、ポジティブな 1 行だけ表示
  if (tiles.length === 0) {
    return (
      <div>
        {headerRow}
        <div className="glass-card p-5 text-sm text-muted">
          {effectiveScope === "mine"
            ? "✅ あなた担当の急ぎタスクはありません。"
            : "✅ 急ぎのタスクはありません。クイックアクションから次の作業に進んでください。"}
        </div>
      </div>
    );
  }

  return (
    <div>
      {headerRow}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => {
          const style = TONE_STYLE[tile.tone];
          return (
            <Link
              key={tile.id}
              href={tile.href}
              className={`glass-card p-5 transition-colors block border ${style.ring}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted">{tile.label}</div>
                  <div className="mt-1 text-3xl font-bold text-primary">
                    {tile.count}
                    <span className="ml-1 text-base font-normal text-muted">件</span>
                  </div>
                </div>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${style.iconBg} ${style.iconColor}`}
                  aria-hidden
                >
                  {tileIcon(tile.id)}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted line-clamp-2">{tile.hint}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
