import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { logger } from "@/lib/logger";
import { availableScopes, type WorkScope } from "@/lib/navigation/scope";
import { fetchTodaySignals, tilesFromSignals } from "@/lib/admin/fetchTodaySignals";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCharts from "./DashboardCharts";
import OnboardingTour from "./OnboardingTour";
import CmdKHintToast from "./CmdKHintToast";
import DashboardModeSwitch from "./DashboardModeSwitch";
import NextActionSection, { NextActionSectionSkeleton } from "./NextActionSection";
import TodayProgressCard, { TodayProgressCardSkeleton } from "./TodayProgressCard";
import DisplayModeSwitcher from "./DisplayModeSwitcher";
import TodayTasksWidget, { TodayTasksWidgetSkeleton } from "./TodayTasksWidget";
import SetupChecklist, { SetupChecklistSkeleton } from "./SetupChecklist";
import ApprovalInboxWidget, { ApprovalInboxWidgetSkeleton } from "./ApprovalInboxWidget";
import AskLedraBar from "./AskLedraBar";
import AnnouncementsBanner from "./AnnouncementsBanner";
import HomeScopeToggle from "./HomeScopeToggle";

// ── Partner Rank System ──
interface PartnerRank {
  key: string;
  label: string;
  color: string; // tailwind text color
  bgColor: string; // tailwind bg color
  minCompleted: number;
  minRating: number | null;
}

const PARTNER_RANKS: PartnerRank[] = [
  {
    key: "platinum",
    label: "プラチナ",
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/40",
    minCompleted: 50,
    minRating: 4.0,
  },
  {
    key: "gold",
    label: "ゴールド",
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/40",
    minCompleted: 20,
    minRating: 3.5,
  },
  {
    key: "silver",
    label: "シルバー",
    color: "text-muted",
    bgColor: "bg-surface-hover",
    minCompleted: 5,
    minRating: null,
  },
  {
    key: "bronze",
    label: "ブロンズ",
    color: "text-warning",
    bgColor: "bg-warning-dim",
    minCompleted: 1,
    minRating: null,
  },
  {
    key: "starter",
    label: "スターター",
    color: "text-muted",
    bgColor: "bg-surface-hover",
    minCompleted: 0,
    minRating: null,
  },
];

function resolveRank(completedOrders: number, avgRating: number | null): PartnerRank {
  for (const rank of PARTNER_RANKS) {
    if (completedOrders >= rank.minCompleted) {
      if (rank.minRating == null || (avgRating != null && avgRating >= rank.minRating)) {
        return rank;
      }
    }
  }
  return PARTNER_RANKS[PARTNER_RANKS.length - 1];
}

const CATEGORY_LABELS: Record<string, string> = {
  detailing: "ディテイリング",
  maintenance: "整備",
  custom: "カスタム",
  bodywork: "板金",
  unset: "未設定",
};

function StatSkeleton() {
  return (
    <div className="animate-pulse grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="glass-card p-5 space-y-2">
          <div className="h-3 w-16 rounded bg-surface-hover" />
          <div className="h-8 w-20 rounded bg-surface-hover" />
          <div className="h-3 w-24 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

// ── Tenant Stats Section ──
async function TenantStats({ tenantId }: { tenantId: string }) {
  const supabase = await createSupabaseServerClient();

  const { data: stats } = await supabase.rpc("dashboard_tenant_stats", { p_tenant_id: tenantId });

  const totalCerts = stats?.total_certs ?? 0;
  const activeCerts = stats?.active_certs ?? 0;
  const voidCerts = stats?.void_certs ?? 0;
  const memberCount = stats?.member_count ?? 0;
  const customerCount = stats?.customer_count ?? 0;
  const invoiceCount = stats?.invoice_count ?? 0;
  const unpaidAmount = stats?.unpaid_amount ?? 0;
  const todayRes = stats?.today_reservations ?? 0;
  const activeRes = stats?.active_reservations ?? 0;
  const activeOrders = stats?.active_orders ?? 0;
  const statusBreakdown: Array<{ status: string; count: number }> = stats?.status_breakdown ?? [];
  const recentActivity: Array<{ date: string; count: number }> = stats?.recent_activity ?? [];

  // ── Partner Score ──
  const { data: partnerScore } = await supabase
    .from("partner_scores")
    .select("total_orders, completed_orders, on_time_orders, cancelled_orders, avg_rating, rating_count")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const ps = partnerScore ?? {
    total_orders: 0,
    completed_orders: 0,
    on_time_orders: 0,
    cancelled_orders: 0,
    avg_rating: null,
    rating_count: 0,
  };
  const rank = resolveRank(ps.completed_orders, ps.avg_rating);
  const completionRate = ps.total_orders > 0 ? Math.round((ps.completed_orders / ps.total_orders) * 100) : null;
  const onTimeRate = ps.completed_orders > 0 ? Math.round((ps.on_time_orders / ps.completed_orders) * 100) : null;

  // Next rank calculation
  const currentIdx = PARTNER_RANKS.findIndex((r) => r.key === rank.key);
  const nextRank = currentIdx > 0 ? PARTNER_RANKS[currentIdx - 1] : null;

  return (
    <>
      {/* Partner Score Card */}
      <div>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">取引実績</h2>
        <div className="glass-card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${rank.bgColor}`}>
              <span className={`text-2xl font-bold ${rank.color}`}>
                {rank.key === "platinum"
                  ? "P"
                  : rank.key === "gold"
                    ? "G"
                    : rank.key === "silver"
                      ? "S"
                      : rank.key === "bronze"
                        ? "B"
                        : "—"}
              </span>
            </div>
            <div>
              <div className={`text-lg font-bold ${rank.color}`}>{rank.label}</div>
              <div className="text-xs text-muted">パートナーランク</div>
            </div>
            {ps.avg_rating != null && (
              <div className="ml-auto text-right">
                <div className="text-2xl font-bold text-yellow-500">
                  {"★".repeat(Math.round(ps.avg_rating))}
                  {"☆".repeat(5 - Math.round(ps.avg_rating))}
                </div>
                <div className="text-xs text-muted">
                  {ps.avg_rating.toFixed(1)} / 5.0（{ps.rating_count}件）
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-4 text-center">
            <div className="p-3 rounded-lg bg-surface-hover">
              <div className="text-2xl font-bold text-primary">{ps.completed_orders}</div>
              <div className="text-[11px] text-muted">完了取引</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-hover">
              <div className="text-2xl font-bold text-primary">
                {completionRate != null ? `${completionRate}%` : "—"}
              </div>
              <div className="text-[11px] text-muted">完了率</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-hover">
              <div className="text-2xl font-bold text-primary">{onTimeRate != null ? `${onTimeRate}%` : "—"}</div>
              <div className="text-[11px] text-muted">納期遵守率</div>
            </div>
            <div className="p-3 rounded-lg bg-surface-hover">
              <div className="text-2xl font-bold text-danger">{ps.cancelled_orders}</div>
              <div className="text-[11px] text-muted">キャンセル</div>
            </div>
          </div>

          {nextRank && (
            <div className="mt-4 p-3 rounded-lg bg-surface-hover text-xs text-muted">
              <span className={`font-semibold ${nextRank.color}`}>{nextRank.label}</span>
              まであと
              {ps.completed_orders < nextRank.minCompleted && (
                <span className="font-semibold text-primary">
                  {" "}
                  {nextRank.minCompleted - ps.completed_orders}件の完了取引
                </span>
              )}
              {nextRank.minRating != null && (ps.avg_rating == null || ps.avg_rating < nextRank.minRating) && (
                <span className="font-semibold text-primary"> 平均評価{nextRank.minRating}以上</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">自店舗</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
            <div className="mt-2 text-3xl font-bold text-primary">{totalCerts}</div>
            <div className="mt-1 text-xs text-muted">施工証明書 総数</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">有効</div>
            <div className="mt-2 text-3xl font-bold text-success">{activeCerts}</div>
            <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">無効</div>
            <div className="mt-2 text-3xl font-bold text-danger">{voidCerts}</div>
            <div className="mt-1 text-xs text-muted">無効の施工証明書</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">メンバー</div>
            <div className="mt-2 text-3xl font-bold text-accent">{memberCount}</div>
            <div className="mt-1 text-xs text-muted">チームメンバー</div>
          </div>
        </div>
      </div>

      {/* Reservations & Orders */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">本日</div>
          <div className="mt-2 text-2xl font-bold text-violet-text">{todayRes}</div>
          <div className="mt-1 text-xs text-muted">本日の予約</div>
        </Link>
        <Link href="/admin/reservations" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">進行中</div>
          <div className="mt-2 text-2xl font-bold text-accent">{activeRes}</div>
          <div className="mt-1 text-xs text-muted">進行中の予約・作業</div>
        </Link>
        <Link href="/admin/orders" className="glass-card p-5 hover:bg-surface-hover transition-colors">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">受発注</div>
          <div className="mt-2 text-2xl font-bold text-warning">{activeOrders}</div>
          <div className="mt-1 text-xs text-muted">進行中の受発注</div>
        </Link>
      </div>

      {/* Tenant sub-stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">顧客</div>
          <div className="mt-2 text-2xl font-bold text-primary">{customerCount}</div>
          <div className="mt-1 text-xs text-muted">顧客数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">請求書</div>
          <div className="mt-2 text-2xl font-bold text-primary">{invoiceCount}</div>
          <div className="mt-1 text-xs text-muted">請求書数</div>
        </div>
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">未回収</div>
          <div className="mt-2 text-2xl font-bold text-warning">¥{unpaidAmount.toLocaleString()}</div>
          <div className="mt-1 text-xs text-muted">未回収額</div>
        </div>
      </div>

      {/* Charts */}
      <DashboardCharts recentActivity={recentActivity} statusBreakdown={statusBreakdown} />
    </>
  );
}

// ── Platform Stats Section ──
async function PlatformStats() {
  const supabase = await createSupabaseServerClient();

  const [pcsResult, csResult, icResult, rsResult] = await Promise.all([
    Promise.resolve(supabase.rpc("platform_certificate_stats")).catch((e: unknown): { data: null } => {
      logger.warn("platform_certificate_stats failed", { err: e instanceof Error ? e.message : String(e) });
      return { data: null };
    }),
    Promise.resolve(supabase.rpc("platform_tenant_category_stats")).catch((e: unknown): { data: null } => {
      logger.warn("platform_tenant_category_stats failed", { err: e instanceof Error ? e.message : String(e) });
      return { data: null };
    }),
    Promise.resolve(supabase.rpc("platform_insurer_count")).catch((e: unknown): { data: number } => {
      logger.warn("platform_insurer_count failed", { err: e instanceof Error ? e.message : String(e) });
      return { data: 0 };
    }),
    Promise.resolve(supabase.rpc("platform_regional_stats")).catch((e: unknown): { data: null } => {
      logger.warn("platform_regional_stats failed", { err: e instanceof Error ? e.message : String(e) });
      return { data: null };
    }),
  ]);

  const platformCertStats = pcsResult?.data ?? null;
  const categoryStats = csResult?.data ?? null;
  const insurerCount = icResult?.data ?? 0;
  const regionalStats = rsResult?.data ?? null;

  if (!platformCertStats && !categoryStats && insurerCount <= 0) return null;

  return (
    <>
      <div>
        <h2 className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">プラットフォーム全体</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platformCertStats && (
            <>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体証明書</div>
                <div className="mt-2 text-3xl font-bold text-primary">{platformCertStats.total}</div>
                <div className="mt-1 text-xs text-muted">プラットフォーム全体</div>
              </div>
              <div className="glass-card p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-muted">全体 有効</div>
                <div className="mt-2 text-3xl font-bold text-success">{platformCertStats.active}</div>
                <div className="mt-1 text-xs text-muted">有効な施工証明書</div>
              </div>
            </>
          )}
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">保険会社</div>
            <div className="mt-2 text-3xl font-bold text-violet-text">{insurerCount}</div>
            <div className="mt-1 text-xs text-muted">保険会社数</div>
          </div>
        </div>
      </div>

      {/* Category & Regional Breakdown */}
      {(categoryStats || regionalStats) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {categoryStats && categoryStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">業種別</div>
              <div className="text-base font-semibold text-primary mb-4">業種別 施工店数</div>
              <div className="space-y-3">
                {(() => {
                  const categoryTotal = categoryStats.reduce((s: number, c: any) => s + c.count, 0);
                  return categoryStats.map((cat: any) => {
                    const pct = categoryTotal > 0 ? Math.round((cat.count / categoryTotal) * 100) : 0;
                    return (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-secondary">
                            {CATEGORY_LABELS[cat.category] ?? cat.category}
                          </span>
                          <span className="text-sm font-semibold text-primary">{cat.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-active overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent to-violet-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {regionalStats && regionalStats.length > 0 && (
            <div className="glass-card p-5">
              <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-1">地域別</div>
              <div className="text-base font-semibold text-primary mb-4">地域別 施工店数</div>
              <div className="space-y-3">
                {(() => {
                  const regionalTotal = regionalStats.reduce((s: number, r: any) => s + r.count, 0);
                  return regionalStats.slice(0, 10).map((reg: any) => {
                    const pct = regionalTotal > 0 ? Math.round((reg.count / regionalTotal) * 100) : 0;
                    return (
                      <div key={reg.prefecture}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-secondary">{reg.prefecture}</span>
                          <span className="text-sm font-semibold text-primary">{reg.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-active overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-success to-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/**
 * 3 秒理解ゾーンの統合ラッパ。fetchTodaySignals 1 回で NEXT ACTION と進捗カードの両方を描画。
 * ponytail: NextActionSection / TodayProgressCard が個別に fetch していた 3 重呼び出しを解消。
 */
async function TodayOverviewSection({
  tenantId,
  scope,
  currentUserId,
}: {
  tenantId: string;
  scope: "tenant" | "mine";
  currentUserId: string | null;
}) {
  const signals = await fetchTodaySignals(tenantId, { scope, currentUserId });
  // NextActionSection は「今日の来店」がすべて completed だと空タイルで null を返す
  // （今日の予約自体はある＝Progress は表示する）。null のときに [1fr_auto] グリッドへ
  // Progress 1個だけ流すと auto ではなく 1fr（本来 NextAction 用の広い列）に入ってしまう。
  const hasNextAction = tilesFromSignals(signals).length > 0;
  const nextAction = <NextActionSection signals={signals} />;
  const progress = <TodayProgressCard signals={signals} scope={scope} />;

  return (
    <div className={`grid gap-4 ${hasNextAction ? "sm:grid-cols-[1fr_auto]" : ""}`}>
      {nextAction}
      {progress}
    </div>
  );
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams?: Promise<{ tasks?: string; scope?: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin");

  const tenantId = caller.tenantId;
  const sp = (await searchParams) ?? {};

  // v2.0 IMP-021: 3 段階スコープ（self/store/all_stores）。
  // 後方互換: 旧 `tasks=mine` も受容する。
  const allowed = availableScopes(caller.role);
  const rawScope = sp.scope ?? (sp.tasks === "mine" ? "self" : null);
  // ponytail: 無指定時のフォールバックは defaultScope(caller.role) を使わず、
  // 常に "store"（既存の tenant-wide 表示）に固定する。defaultScope() は
  // admin 未満のロールに "self" を返すため、staff/viewer が今まで見えていた
  // 店舗全体のタスクが、何も選んでいないだけで「自分の分だけ」に縮む
  // （viewer は availableScopes が self のみでトグル自体出ないため戻す手段も無い）。
  // 挙動を変えるなら明示的な代表判断が要る。
  const workScope: WorkScope = rawScope && allowed.includes(rawScope as WorkScope) ? (rawScope as WorkScope) : "store";

  // ponytail: fetchTodaySignals は "tenant"/"mine" を受けるので変換する。
  // all_stores は store と同挙動（単一テナント前提）。
  const tasksScope: "tenant" | "mine" = workScope === "self" ? "mine" : "tenant";

  const adminContent = (
    <>
      {/* Ledraに聞く — 90近い管理画面をナビで探す前に、まず自由入力で聞ける入口 */}
      <AskLedraBar />

      {/* 運営からのお知らせ（アップデート予告等）。未読があればバッジ表示、0件なら自動で非表示。 */}
      <AnnouncementsBanner />

      {/* ── 3 秒理解ゾーン (IMP-021 / v2.0 §5) ── */}
      {/* NEXT ACTION + 今日の進捗。1 回の fetchTodaySignals で両方描画。 */}
      {tenantId && (
        <Suspense
          fallback={
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <NextActionSectionSkeleton />
              <TodayProgressCardSkeleton />
            </div>
          }
        >
          <TodayOverviewSection tenantId={tenantId} scope={tasksScope} currentUserId={caller.userId} />
        </Suspense>
      )}

      {/* AI 自動化の人の承認待ち — 一等地に常設（0 件なら自動で非表示） */}
      {tenantId && (
        <Suspense fallback={<ApprovalInboxWidgetSkeleton />}>
          <ApprovalInboxWidget tenantId={tenantId} role={caller.role} />
        </Suspense>
      )}

      {/* Setup Checklist — 完了で自動的に非表示 */}
      {tenantId && (
        <Suspense fallback={<SetupChecklistSkeleton />}>
          <SetupChecklist tenantId={tenantId} userId={caller.userId} />
        </Suspense>
      )}

      {/* Quick Actions - 2段目 */}
      <div data-tour="quick-actions">
        <h2 className="text-sm font-semibold tracking-[0.18em] text-muted mb-3">クイックアクション</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/admin/certificates"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-accent"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                証明書一覧
              </div>
              <div className="text-xs text-muted">証明書の管理・検索</div>
            </div>
          </Link>

          <Link
            href="/admin/certificates/new"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-success"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-success transition-colors">
                新規発行
              </div>
              <div className="text-xs text-muted">施工証明書を発行</div>
            </div>
          </Link>

          <Link
            href="/admin/jobs/new"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-accent"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                🏃 飛び込み案件
              </div>
              <div className="text-xs text-muted">予約なしで案件をすぐ開始</div>
            </div>
          </Link>

          <Link
            href="/admin/customers"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-accent"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
                />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-accent transition-colors">
                顧客管理
              </div>
              <div className="text-xs text-muted">顧客情報の登録・編集</div>
            </div>
          </Link>

          <Link
            href="/admin/invoices"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-warning"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-warning transition-colors">
                請求書
              </div>
              <div className="text-xs text-muted">請求書の作成・管理</div>
            </div>
          </Link>

          <Link
            href="/admin/billing"
            className="glass-card p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors group"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-dim">
              <svg
                width="20"
                height="20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-warning"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z"
                />
              </svg>
            </span>
            <div>
              <div className="text-sm font-semibold text-primary group-hover:text-warning transition-colors">
                請求・プラン
              </div>
              <div className="text-xs text-muted">課金状況の確認</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Today's Tasks (タスク指向ウィジェット) */}
      {tenantId && (
        <Suspense fallback={<TodayTasksWidgetSkeleton />}>
          <TodayTasksWidget tenantId={tenantId} scope={tasksScope} currentUserId={caller.userId} />
        </Suspense>
      )}

      {/* Tenant Stats */}
      {tenantId && (
        <Suspense fallback={<StatSkeleton />}>
          <TenantStats tenantId={tenantId} />
        </Suspense>
      )}

      {/* Platform Stats */}
      <Suspense fallback={<StatSkeleton />}>
        <PlatformStats />
      </Suspense>
    </>
  );

  return (
    <div className="space-y-6">
      <OnboardingTour />
      <CmdKHintToast />
      <PageHeader
        tag="管理画面"
        title="ダッシュボード"
        description="施工証明書の管理状況を一目で確認"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <HomeScopeToggle scope={workScope} scopes={allowed} defaultScopeValue="store" />
            <DisplayModeSwitcher />
          </div>
        }
      />
      <DashboardModeSwitch adminContent={adminContent} />
    </div>
  );
}
