import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import dayjs from "dayjs";
import "dayjs/locale/ja";

import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/lib/supabase";
import { scopeToStore } from "@/lib/storeScope";
import { getHomePresentation } from "@/lib/homePresentation";
import { useTabContentInset } from "@/hooks/useTabContentInset";
import { NotifBell } from "@/components/NotifBell";
import { colors, radius, spacing, sizing, shadows } from "@/constants/tokens";
import { ProgressRing, SegmentedControl, StatusBadge, Skeleton } from "@/components/ui";
import { DisplayModeControl } from "@/components/DisplayModeControl";
import { DisplayModeOnboarding } from "@/components/DisplayModeOnboarding";
import { useDisplayMode } from "@/stores/uiPreferencesStore";

dayjs.locale("ja");

// ─── Types ───────────────────────────────────────────────────────────

type Scope = "self" | "store" | "all";

interface HomeStats {
  todayTotal: number;
  todayCompleted: number;
  inProgress: number;
  awaitingConfirmation: number;
  notStarted: number;
  awaitingPayment: number;
  issues: Issue[];
  timeline: TimelineEntry[];
  nextAction: NextAction | null;
  activeWork: ActiveWorkEntry[];
}

interface Issue {
  id: string;
  label: string;
  severity: "CRITICAL" | "HIGH" | "ACTION";
  title: string;
  detail: string;
  route: string;
}

interface TimelineEntry {
  id: string;
  time: string;
  title: string;
  detail?: string;
  isNow?: boolean;
  status: "completed" | "in_progress" | "scheduled";
}

interface NextAction {
  title: string;
  vehicleName: string;
  plateNumber: string;
  workType: string;
  deadline: string;
  estimatedCompletion?: string;
  partsStatus?: string;
  liftStatus?: string;
  estimatedTime?: string;
  reason: string;
  route: string;
}

interface ActiveWorkEntry {
  id: string;
  progress: number;
  vehicleName: string;
  plateNumber: string;
  workType: string;
  worker: string;
  nextStep: string;
  estimatedCompletion: string;
  deadline: string;
}

const NFC_LOW_STOCK_THRESHOLD = 10;

const EMPTY_STATS: HomeStats = {
  todayTotal: 0,
  todayCompleted: 0,
  inProgress: 0,
  awaitingConfirmation: 0,
  notStarted: 0,
  awaitingPayment: 0,
  issues: [],
  timeline: [],
  nextAction: null,
  activeWork: [],
};

// ─── Main Screen ─────────────────────────────────────────────────────

export default function HomeScreen() {
  const tabInset = useTabContentInset();
  // ヘッダー非表示（画面名の帯を出さない）なので上端は自前で空ける
  const insets = useSafeAreaInsets();
  const { user, selectedStore } = useAuthStore();
  const [scope, setScope] = useState<Scope>("self");
  const [stats, setStats] = useState<HomeStats>(EMPTY_STATS);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [scopeExpanded, setScopeExpanded] = useState(false);
  const displayMode = useDisplayMode();
  const presentation = getHomePresentation(displayMode);

  // ponytail: recalculated on every render so it stays current across midnight
  const today = dayjs();

  const loadStats = useCallback(async () => {
    if (!user?.tenantId) return;

    // UTC 日付だと JST 09:00 前は前日を集計してしまう
    const todayStr = dayjs().format("YYYY-MM-DD");
    const storeId = scope === "all" ? null : selectedStore?.id || null;

    let q1 = supabase.from("reservations").select("id, status", { count: "exact" }).eq("tenant_id", user.tenantId);
    q1 = scopeToStore(q1, storeId);

    let q2 = supabase
      .from("reservations")
      .select("id, status, start_time, customer:customers ( name ), vehicle:vehicles ( plate_display, maker, model )")
      .eq("tenant_id", user.tenantId);
    q2 = scopeToStore(q2, storeId);

    let q3 = supabase.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", user.tenantId);
    q3 = scopeToStore(q3, storeId);

    let q5 = supabase
      .from("reservations")
      .select(
        "id, scheduled_date, start_time, status, customer:customers ( name ), vehicle:vehicles ( plate_display, maker, model )",
      )
      .eq("tenant_id", user.tenantId);
    q5 = scopeToStore(q5, storeId);

    if (scope === "self") {
      q1 = q1.eq("assigned_user_id", user.id);
      q2 = q2.eq("assigned_user_id", user.id);
      q3 = q3.eq("assigned_user_id", user.id);
      q5 = q5.eq("assigned_user_id", user.id);
    }

    // ホームで描画する件数だけ取得する。進行中案件が増えても全件を端末へ送らない。
    q2 = q2
      .order("scheduled_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(presentation.activeWorkLimit);

    const [todayRes, activeWork, awaitingPay, preparedTags, todayTimeline] = await Promise.all([
      q1.eq("scheduled_date", todayStr).not("status", "eq", "cancelled"),
      q2.in("status", ["arrived", "in_progress"]),
      q3.eq("status", "completed").eq("payment_status", "unpaid"),
      supabase
        .from("nfc_tags")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", user.tenantId)
        .eq("status", "prepared")
        .is("uid", null),
      q5
        .eq("scheduled_date", todayStr)
        .not("status", "eq", "cancelled")
        .order("start_time", { ascending: true })
        .limit(8),
    ]);

    const todayTotal = todayRes.count ?? 0;
    const todayData = (todayRes.data ?? []) as Array<{ id: string; status: string }>;
    const todayCompleted = todayData.filter((r) => r.status === "completed" || r.status === "delivered").length;
    const inProgressCount = todayData.filter((r) => r.status === "in_progress" || r.status === "arrived").length;
    const awaitingConfirmation = todayData.filter((r) => r.status === "awaiting_confirmation").length;
    const notStarted = todayTotal - todayCompleted - inProgressCount - awaitingConfirmation;

    // Build issues
    const issues: Issue[] = [];
    const nfcCount = preparedTags.count ?? 0;
    if (nfcCount <= NFC_LOW_STOCK_THRESHOLD) {
      issues.push({
        id: "nfc-low",
        label: nfcCount === 0 ? "CRITICAL" : "HIGH",
        severity: nfcCount === 0 ? "CRITICAL" : "HIGH",
        title: "NFCタグ在庫不足",
        detail: `残り ${nfcCount} 枚`,
        route: "/nfc/tags",
      });
    }
    const unpaid = awaitingPay.count ?? 0;
    if (unpaid > 0) {
      issues.push({
        id: "unpaid",
        label: "ACTION",
        severity: "ACTION",
        title: "決済確認待ち",
        detail: `¥未精算 ${unpaid} 件`,
        route: "/pos",
      });
    }

    // Active work entries
    const activeWorkData = (
      (activeWork.data ?? []) as unknown as Array<{
        id: string;
        status: string;
        customer: { name: string } | null;
        vehicle: { plate_display: string; maker: string; model: string } | null;
        start_time: string | null;
      }>
    ).map((r) => ({
      id: r.id,
      progress: r.status === "in_progress" ? 0.5 : 0.2,
      vehicleName: r.vehicle ? `${r.vehicle.maker} ${r.vehicle.model}`.trim() || r.vehicle.plate_display : "車両",
      plateNumber: r.vehicle?.plate_display ?? "",
      workType: "",
      worker: r.customer?.name ?? "",
      nextStep: "",
      estimatedCompletion: "",
      deadline: r.start_time ? r.start_time.slice(0, 5) : "",
    }));

    // Build timeline
    const timeline: TimelineEntry[] = (
      (todayTimeline.data ?? []) as unknown as Array<{
        id: string;
        start_time: string | null;
        status: string;
        customer: { name: string } | null;
        vehicle: { plate_display: string; maker: string; model: string } | null;
      }>
    ).map((r) => ({
      id: r.id,
      time: r.start_time ? r.start_time.slice(0, 5) : "時刻未定",
      title: r.vehicle?.plate_display || r.customer?.name || "予約",
      status: (r.status === "completed" || r.status === "delivered"
        ? "completed"
        : r.status === "in_progress" || r.status === "arrived"
          ? "in_progress"
          : "scheduled") as TimelineEntry["status"],
    }));

    // Mark current timeline entry
    const now = dayjs().format("HH:mm");
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i].time <= now && timeline[i].status !== "completed") {
        timeline[i].isNow = true;
        break;
      }
    }

    // Determine next action
    let nextAction: NextAction | null = null;
    const activeCount = activeWork.count ?? activeWorkData.length;
    if (activeCount > 0) {
      const first = activeWorkData[0];
      nextAction = {
        title: "作業を開始",
        vehicleName: first?.vehicleName ?? "車両",
        plateNumber: first?.plateNumber ?? "",
        workType: first?.workType ?? "",
        deadline: first?.deadline ? `納車 ${first.deadline}` : "",
        reason: `今開始すれば予定通り完了できます。`,
        route: "/(tabs)/work",
      };
    } else if (todayTotal > todayCompleted) {
      nextAction = {
        title: "次の入庫を受け付ける",
        vehicleName: "",
        plateNumber: "",
        workType: "",
        deadline: "",
        reason: `本日の残り ${todayTotal - todayCompleted} 件`,
        route: "/reservations",
      };
    } else if (unpaid > 0) {
      nextAction = {
        title: "会計処理を完了する",
        vehicleName: "",
        plateNumber: "",
        workType: "",
        deadline: "",
        reason: `${unpaid} 件の未精算あり`,
        route: "/pos",
      };
    }

    setStats({
      todayTotal,
      todayCompleted,
      inProgress: inProgressCount,
      awaitingConfirmation,
      notStarted: Math.max(0, notStarted),
      awaitingPayment: unpaid,
      issues,
      timeline,
      nextAction,
      activeWork: activeWorkData,
    });
  }, [presentation.activeWorkLimit, scope, selectedStore, user]);

  useEffect(() => {
    // 認証・店舗・集計範囲が変わった時に、画面の集計値を同期する。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats()
      .catch(() => {
        // ponytail: swallow — initial load error shows empty state, not stuck skeleton
      })
      .finally(() => setLoading(false));
  }, [loadStats]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadStats();
    } finally {
      setRefreshing(false);
    }
  }

  const progress = stats.todayTotal > 0 ? stats.todayCompleted / stats.todayTotal : 0;

  const scopeLabel = scope === "self" ? "自分" : scope === "store" ? "店舗" : "全店舗";
  const scopeControl = (
    <SegmentedControl
      segments={[
        { value: "self" as Scope, label: "自分" },
        { value: "store" as Scope, label: "店舗" },
        { value: "all" as Scope, label: "全店舗" },
      ]}
      value={scope}
      onChange={(nextScope) => {
        setLoading(true);
        setScope(nextScope);
        setScopeExpanded(false);
      }}
    />
  );
  const scopeSection = presentation.collapseScope ? (
    <View style={styles.section}>
      <Pressable
        style={styles.collapsedScopeButton}
        onPress={() => setScopeExpanded((expanded) => !expanded)}
        accessibilityRole="button"
        accessibilityLabel={`表示する範囲は${scopeLabel}`}
        accessibilityState={{ expanded: scopeExpanded }}
      >
        <View>
          <Text style={styles.collapsedScopeLabel}>表示する範囲</Text>
          <Text style={styles.collapsedScopeValue}>{scopeLabel}</Text>
        </View>
        <Icon
          source={scopeExpanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={colors.textSecondary}
        />
      </Pressable>
      {scopeExpanded ? <View style={styles.expandedScopeControl}>{scopeControl}</View> : null}
    </View>
  ) : (
    <View style={styles.section}>
      <Text style={styles.controlLabel}>表示する範囲</Text>
      {scopeControl}
    </View>
  );

  const todaySummarySection = (
    <View style={styles.section}>
      <View style={styles.todayCard}>
        <View style={[styles.todayHeader, displayMode === "simple" && styles.todayHeaderSimple]}>
          <View>
            <Text style={styles.todayLabel}>本日の作業</Text>
            <View style={styles.todayCountRow}>
              <Text style={styles.todayCount}>{loading ? "-" : stats.todayTotal}</Text>
              <Text style={styles.todayUnit}>件</Text>
            </View>
          </View>
          <ProgressRing progress={progress} size={72} strokeWidth={6} label={`${Math.round(progress * 100)}%`} />
        </View>
        {!presentation.showDetailedStatus ? (
          <Text style={styles.simpleProgressText}>
            {loading ? "作業状況を確認しています" : `${stats.todayCompleted}件完了・残り${Math.max(0, stats.todayTotal - stats.todayCompleted)}件`}
          </Text>
        ) : (
          <View style={styles.statusRow}>
            <StatusPill label="作業中" count={stats.inProgress} severity="warning" />
            <StatusPill label="確認待ち" count={stats.awaitingConfirmation} severity="danger" />
            <StatusPill label="未完了" count={stats.notStarted} severity="neutral" />
            <StatusPill label="完了" count={stats.todayCompleted} severity="success" />
          </View>
        )}
      </View>
    </View>
  );

  const nextActionSection = loading ? (
    <View style={styles.section}>
      <Skeleton height={120} borderRadius={radius.card} />
    </View>
  ) : stats.nextAction ? (
    <View style={styles.section}>
      <Pressable
        style={styles.nextActionCard}
        onPress={() => router.push(stats.nextAction!.route as never)}
        accessibilityRole="button"
        accessibilityLabel={`次のアクション: ${stats.nextAction.title}`}
      >
        <View style={styles.naTopRow}>
          <Text style={styles.naLabel}>{displayMode === "simple" ? "次にすること" : "NEXT ACTION"}</Text>
          {stats.issues.length > 0 && <StatusBadge label="優先度 高" severity="danger" compact />}
        </View>

        {stats.nextAction.vehicleName ? (
          <View style={styles.naVehicleRow}>
            <Icon source="car-outline" size={20} color={colors.textSecondary} />
            <View style={styles.naVehicleText}>
              <Text style={styles.naVehicleName}>{stats.nextAction.vehicleName}</Text>
              {stats.nextAction.plateNumber ? <Text style={styles.naPlate}>{stats.nextAction.plateNumber}</Text> : null}
              {stats.nextAction.workType ? <Text style={styles.naWorkType}>{stats.nextAction.workType}</Text> : null}
            </View>
            {stats.nextAction.deadline ? <Text style={styles.naDeadline}>{stats.nextAction.deadline}</Text> : null}
          </View>
        ) : null}

        <View style={styles.naReasonRow}>
          <Icon source="information-outline" size={16} color={colors.primary} />
          <Text style={styles.naReason}>{stats.nextAction.reason}</Text>
        </View>

        <View style={styles.naCta}>
          <Text style={styles.naCtaText}>{stats.nextAction.title}</Text>
          <Icon source="arrow-right" size={20} color={colors.textOnPrimary} />
        </View>
      </Pressable>
    </View>
  ) : (
    <View style={styles.section}>
      <View style={styles.allDoneCard}>
        <Icon source="check-circle" size={24} color={colors.success} />
        <Text style={styles.allDoneText}>本日のタスクはすべて完了しました</Text>
      </View>
    </View>
  );

  return (
    <>
      <DisplayModeOnboarding />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.screenContent, { paddingBottom: tabInset }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* ── 1. Header: date, greeting, store, bell ── */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.dateText}>{today.format("M月D日（dd）").toUpperCase()}</Text>
              <Text style={styles.greeting}>
                {getGreeting()}、{user?.email?.split("@")[0] ?? ""}さん
              </Text>
              <Text style={styles.storeName}>{selectedStore?.name}</Text>
            </View>
            <View style={styles.headerRight}>
              <NotifBell />
            </View>
          </View>

          <View style={styles.displayModeBlock}>
            <Text style={[styles.controlLabel, styles.headerControlLabel]}>ホームの表示</Text>
            <View style={styles.displayModeRow}>
              <View style={styles.displayModeControl}>
                <DisplayModeControl compact />
              </View>
              <Pressable
                style={styles.displaySettingsButton}
                onPress={() => router.push("/settings/display")}
                accessibilityRole="button"
                accessibilityLabel="表示設定を開く"
              >
                <Icon source="tune-variant" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* かんたん表示は「次にすること」を集計や範囲選択より先に見せる。 */}
        {presentation.nextActionFirst && nextActionSection}
        {scopeSection}
        {todaySummarySection}
        {!presentation.nextActionFirst && nextActionSection}

        {/* ── 5. In-progress work (compact) ── */}
        {displayMode !== "simple" && stats.activeWork.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>進行中の作業</Text>
              <Pressable onPress={() => router.push("/(tabs)/work")}>
                <Text style={styles.seeAll}>すべて見る →</Text>
              </Pressable>
            </View>
            <View style={styles.activeWorkList}>
              {stats.activeWork.slice(0, presentation.activeWorkLimit).map((work) => (
                <Pressable
                  key={work.id}
                  style={styles.activeWorkRow}
                  onPress={() => router.push(`/work/${work.id}` as never)}
                  accessibilityRole="button"
                >
                  <View style={styles.activeWorkProgress}>
                    <ProgressRing
                      progress={work.progress}
                      size={40}
                      strokeWidth={3}
                      label={`${Math.round(work.progress * 100)}%`}
                    />
                  </View>
                  <View style={styles.activeWorkInfo}>
                    <View style={styles.activeWorkTopRow}>
                      <StatusBadge label="作業中" severity="warning" compact />
                      <Text style={styles.activeWorkVehicle} numberOfLines={1}>
                        {work.vehicleName}
                      </Text>
                    </View>
                    {work.worker ? (
                      <Text style={styles.activeWorkMeta} numberOfLines={1}>
                        {work.worker}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── 6. Action-needed issues (severity cards) ── */}
        {stats.issues.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>要対応</Text>
            <View style={styles.issueList}>
              {stats.issues.map((issue) => (
                <Pressable
                  key={issue.id}
                  style={[
                    styles.issueRow,
                    issue.severity === "CRITICAL" && styles.issueCritical,
                    issue.severity === "HIGH" && styles.issueHigh,
                    issue.severity === "ACTION" && styles.issueAction,
                  ]}
                  onPress={() => router.push(issue.route as never)}
                  accessibilityRole="button"
                >
                  <View style={styles.issueLeft}>
                    <Icon
                      source={
                        issue.severity === "CRITICAL"
                          ? "alert"
                          : issue.severity === "HIGH"
                            ? "alert-circle-outline"
                            : "information-outline"
                      }
                      size={18}
                      color={
                        issue.severity === "CRITICAL"
                          ? colors.danger
                          : issue.severity === "HIGH"
                            ? colors.warningDark
                            : colors.primary
                      }
                    />
                    <View
                      style={[
                        styles.issueLabelBadge,
                        issue.severity === "CRITICAL" && { backgroundColor: colors.dangerLight },
                        issue.severity === "HIGH" && { backgroundColor: colors.warningLight },
                        issue.severity === "ACTION" && { backgroundColor: colors.primaryLight },
                      ]}
                    >
                      <Text
                        style={[
                          styles.issueLabelText,
                          issue.severity === "CRITICAL" && { color: colors.danger },
                          issue.severity === "HIGH" && { color: colors.warningDark },
                          issue.severity === "ACTION" && { color: colors.primary },
                        ]}
                      >
                        {issue.label}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.issueContent}>
                    <Text style={styles.issueTitle} numberOfLines={1}>
                      {issue.title}
                    </Text>
                    <Text style={styles.issueDetail} numberOfLines={1}>
                      {issue.detail}
                    </Text>
                  </View>
                  <Icon source="chevron-right" size={18} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── 7. Today timeline ── */}
        {displayMode === "dense" && stats.timeline.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>今日の予定</Text>
            <View style={styles.timelineCard}>
              {stats.timeline.map((entry, i) => (
                <View key={entry.id}>
                  {i > 0 && <View style={styles.timelineDivider} />}
                  <View style={styles.timelineRow}>
                    {/* NOW marker or time */}
                    {entry.isNow ? (
                      <View style={styles.nowMarkerWrap}>
                        <View style={styles.nowDot} />
                        <Text style={styles.nowText}>NOW</Text>
                      </View>
                    ) : (
                      <Text style={styles.timelineTime}>{entry.time}</Text>
                    )}
                    <Text style={styles.timelineTitle} numberOfLines={1}>
                      {entry.title}
                    </Text>
                    {entry.detail && (
                      <Text style={styles.timelineDetail} numberOfLines={1}>
                        {entry.detail}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 10) return "おはようございます";
  if (hour < 17) return "お疲れさまです";
  return "お疲れさまでした";
}

/** Status pill in the today card (作業中 3, 確認待ち 2, etc.) */
function StatusPill({
  label,
  count,
  severity,
}: {
  label: string;
  count: number;
  severity: "success" | "warning" | "danger" | "neutral";
}) {
  const bgMap = {
    success: colors.successLight,
    warning: colors.warningLight,
    danger: colors.dangerLight,
    neutral: colors.surfaceVariant,
  };
  const fgMap = {
    success: colors.successDark,
    warning: colors.warningDark,
    danger: colors.dangerDark,
    neutral: colors.textSecondary,
  };

  return (
    <View style={[styles.statusPill, { backgroundColor: bgMap[severity] }]}>
      <Text style={[styles.statusPillLabel, { color: fgMap[severity] }]}>{label}</Text>
      <Text style={[styles.statusPillCount, { color: fgMap[severity] }]}>{count}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenContent: {},

  // Header
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerLeft: { flex: 1 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  displayModeBlock: { gap: spacing.sm },
  displayModeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  displayModeControl: { flex: 1 },
  displaySettingsButton: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  controlLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  collapsedScopeButton: {
    minHeight: sizing.touchTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  collapsedScopeLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  collapsedScopeValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  expandedScopeControl: {
    marginTop: spacing.sm,
  },
  headerControlLabel: { marginBottom: 0 },
  dateText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textSecondary,
    lineHeight: 18,
    letterSpacing: 0.5,
  },
  greeting: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
    lineHeight: 28,
    marginTop: 2,
  },
  storeName: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Section
  section: {
    paddingHorizontal: spacing.xl,
    marginTop: spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  // Today card
  todayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    ...shadows.card,
  },
  todayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  todayHeaderSimple: {
    marginBottom: spacing.md,
  },
  simpleProgressText: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    lineHeight: 20,
  },
  todayLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  todayCountRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  todayCount: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.textPrimary,
    lineHeight: 42,
  },
  todayUnit: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  statusRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statusPill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    gap: 2,
  },
  statusPillLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  statusPillCount: {
    fontSize: 18,
    fontWeight: "700",
  },

  // Next Action
  nextActionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1.5,
    borderColor: colors.primary,
    padding: spacing.xl,
    ...shadows.card,
  },
  naTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  naLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  naVehicleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  naVehicleText: {
    flex: 1,
  },
  naVehicleName: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  naPlate: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  naWorkType: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  naDeadline: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  naReasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    marginBottom: spacing.lg,
  },
  naReason: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: colors.primary,
  },
  naCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  naCtaText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },

  // All done
  allDoneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.successLight,
    borderRadius: radius.card,
    padding: spacing.xl,
  },
  allDoneText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.successDark,
  },

  // Active work
  activeWorkList: {
    gap: spacing.sm,
  },
  activeWorkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  activeWorkProgress: {
    width: 44,
    alignItems: "center",
  },
  activeWorkInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  activeWorkTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  activeWorkVehicle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  activeWorkMeta: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Issues
  issueList: {
    gap: spacing.sm,
  },
  issueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    gap: spacing.md,
    minHeight: sizing.touchTarget + spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  issueCritical: {
    backgroundColor: colors.dangerLight,
    borderColor: "#FECACA",
  },
  issueHigh: {
    backgroundColor: colors.warningLight,
    borderColor: "#FDE68A",
  },
  issueAction: {
    backgroundColor: colors.primaryLight,
    borderColor: "#BFDBFE",
  },
  issueLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  issueLabelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  issueLabelText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  issueContent: {
    flex: 1,
  },
  issueTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  issueDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Timeline
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: sizing.touchTarget,
  },
  timelineDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 60,
  },
  timelineTime: {
    width: 48,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  nowMarkerWrap: {
    width: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  nowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  nowText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  timelineTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: colors.textPrimary,
  },
  timelineDetail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
});
