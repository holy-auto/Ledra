import Link from "next/link";
import { type TaskTile } from "@/lib/admin/todayTasks";
import { fetchTodaySignals, tilesFromSignals, fetchStoredDailyDigest } from "@/lib/admin/fetchTodaySignals";
import { buildDeterministicDigest } from "@/lib/admin/dailyDigest";
// ponytail: 旧 TodayTasksScopeToggle は IMP-021 の HomeScopeToggle に統合。
// scope はページ上部のトグルで一括切替し、ここへは props で渡される。

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
  const effectiveScope = scope === "mine" && currentUserId ? "mine" : "tenant";

  // データ取得は fetchTodaySignals に集約 (日次サマリ・cron と共有)。
  // 保存済み AI サマリ (日次 cron 生成) は並列で読む。
  const [signals, storedDigest] = await Promise.all([
    fetchTodaySignals(tenantId, { scope, currentUserId }),
    fetchStoredDailyDigest(tenantId),
  ]);
  const tiles = tilesFromSignals(signals);

  // ponytail: scope 表示は HomeScopeToggle がページ全体で統一。
  // ここではラベル補足だけ。
  const headerRow = (
    <h2 className="text-sm font-semibold tracking-[0.18em] text-muted mb-3">
      今日のタスク
      {effectiveScope === "mine" && <span className="ml-2 text-[11px] text-accent">(あなた担当のみ)</span>}
    </h2>
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

  // 「今日のまとめ」(AIマネージャー): 日次 cron が保存した AI 整形版があれば
  // それを、無ければ描画時に決定論版 (AIコストなし) を出す。数値はいずれも
  // タイル (決定論・SQL由来) が源。
  // storedDigest は店舗全体(cron)の要約。mine スコープでは個人タイルと矛盾するため使わない。
  const digest = effectiveScope === "tenant" && storedDigest ? storedDigest : buildDeterministicDigest(tiles);

  return (
    <div>
      {headerRow}
      <div className="glass-card mb-4 flex items-start gap-2 p-4">
        <span aria-hidden className="text-lg leading-none">
          🗒️
        </span>
        <p className="text-sm leading-relaxed text-secondary">{digest.text}</p>
      </div>
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
