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

// ponytail: アイコンは heroicons outline の path を流用（サイドバーの adminNav.tsx・クイックアクションと同じ線画）。
const ICON_WRENCH =
  "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z";
const ICON_CALENDAR =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5";
const ICON_CURRENCY =
  "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";
const ICON_RECEIPT =
  "M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0c1.1.128 1.907 1.077 1.907 2.185ZM9.75 9h.008v.008H9.75V9Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm4.125 4.5h.008v.008h-.008V13.5Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z";
const ICON_CLOCK = "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z";
const ICON_WARNING =
  "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z";

const TILE_ICON: Record<TaskTile["id"], string> = {
  in_progress_jobs: ICON_WRENCH,
  today_visits: ICON_CALENDAR,
  overdue_invoices: ICON_CURRENCY,
  unpaid_invoices: ICON_RECEIPT,
  expiring_certificates: ICON_CLOCK,
  churn_risk_customers: ICON_WARNING,
};

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
            ? "あなた担当の急ぎタスクはありません。"
            : "急ぎのタスクはありません。クイックアクションから次の作業に進んでください。"}
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
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${style.iconBg} ${style.iconColor}`}
                  aria-hidden
                >
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={TILE_ICON[tile.id]} />
                  </svg>
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
