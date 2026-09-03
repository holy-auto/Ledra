import { useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
} from "react-native";
import { Text, Icon, IconButton } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { scopeToStore } from "@/lib/storeScope";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { getReservationPresentation } from "@/lib/reservationPresentation";
import { useDisplayMode } from "@/stores/uiPreferencesStore";
import {
  colors,
  spacing,
  radius,
  sizing,
  typography,
  shadows,
} from "@/constants/tokens";


type ReservationStatus =
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

interface Reservation {
  id: string;
  scheduled_date: string;
  start_time: string | null;
  status: ReservationStatus;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_display: string;
    maker: string;
    model: string;
  } | null;
}

type ReservationQueryResult = {
  items: Reservation[];
  total: number;
};

const EMPTY_RESERVATIONS: Reservation[] = [];

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: "確認済",
  arrived: "来店",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
};

const STATUS_SEVERITY: Record<
  ReservationStatus,
  "info" | "warning" | "success" | "danger"
> = {
  confirmed: "info",
  arrived: "warning",
  in_progress: "warning",
  completed: "success",
  cancelled: "danger",
};

const FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "confirmed", label: "確認済" },
  { key: "arrived", label: "来店" },
  { key: "in_progress", label: "作業中" },
  { key: "completed", label: "完了" },
];

export default function ReservationsScreen() {
  const { user, selectedStore } = useAuthStore();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const displayMode = useDisplayMode();
  const presentation = getReservationPresentation(displayMode);

  // 見出しの formatDate はローカル日付なので、クエリも揃える（UTC だと前日を引く）
  const dateStr = dayjs(selectedDate).format("YYYY-MM-DD");

  const {
    data: reservationResult,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      "reservations",
      user?.tenantId,
      selectedStore?.id,
      dateStr,
      statusFilter,
      presentation.queryLimit,
    ],
    queryFn: async () => {
      if (!user?.tenantId) {
        return { items: [], total: 0 } satisfies ReservationQueryResult;
      }

      let query = supabase
        .from("reservations")
        .select(
        `
          id,
          scheduled_date,
          start_time,
          status,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_display, maker, model )
        `,
          { count: "exact" },
        )
        .eq("tenant_id", user.tenantId)
        .eq("scheduled_date", dateStr)
        .order("start_time", { ascending: true })
        .limit(presentation.queryLimit);

      query = scopeToStore(query, selectedStore?.id);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []) as unknown as Reservation[],
        total: count ?? data?.length ?? 0,
      } satisfies ReservationQueryResult;
    },
    enabled: !!user?.tenantId,
  });

  const reservations = reservationResult?.items ?? EMPTY_RESERVATIONS;
  const total = reservationResult?.total ?? 0;

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const onDateChange = (_: unknown, date?: Date) => {
    setShowDatePicker(false);
    if (date) setSelectedDate(date);
  };

  const shiftDate = (days: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + days);
    setSelectedDate(next);
  };

  const formatDate = (d: Date) =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  const formatTime = (t: string | null) => {
    if (!t) return "--:--";
    return t.slice(0, 5);
  };

  const renderItem = ({ item }: { item: Reservation }) => {
    const isSimple = presentation.cardVariant === "simple";
    const isDense = presentation.cardVariant === "dense";

    return (
      <Pressable
        style={[styles.card, isSimple && styles.cardSimple, isDense && styles.cardDense]}
        onPress={() => router.push(`/reservations/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.customer?.name ?? "未登録"} ${formatTime(item.start_time)}`}
      >
        <View style={[styles.cardMain, isDense && styles.cardMainDense]}>
          <View style={[styles.cardLeft, isSimple && styles.cardLeftSimple, isDense && styles.cardLeftDense]}>
            <Text style={[styles.time, isSimple && styles.timeSimple, isDense && styles.timeDense]}>
              {formatTime(item.start_time)}
            </Text>
          </View>
          <View style={styles.cardCenter}>
            <Text
              style={[
                styles.customerName,
                isSimple && styles.customerNameSimple,
                isDense && styles.customerNameDense,
              ]}
              numberOfLines={1}
            >
              {item.customer?.name ?? "未登録"}
            </Text>
            {!isDense && (
              <Text style={styles.vehicleInfo} numberOfLines={1}>
                {item.vehicle
                  ? `${item.vehicle.plate_display}  ${item.vehicle.maker} ${item.vehicle.model}`
                  : "車両未登録"}
              </Text>
            )}
          </View>
          <StatusBadge
            label={STATUS_LABELS[item.status]}
            severity={STATUS_SEVERITY[item.status]}
            compact
          />
          {isDense && (
            <Icon source="chevron-right" size={18} color={colors.textTertiary} />
          )}
        </View>

        {isSimple && (
          <View style={styles.simpleCta}>
            <Text style={styles.simpleCtaText}>予約を開く</Text>
            <Icon source="arrow-right" size={20} color={colors.textOnPrimary} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Date picker row */}
      <View style={styles.dateRow}>
        <IconButton
          icon="chevron-left"
          size={20}
          iconColor={colors.textPrimary}
          onPress={() => shiftDate(-1)}
          accessibilityLabel="前日へ"
        />
        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={styles.dateButton}
          accessibilityRole="button"
          accessibilityLabel={`日付選択: ${formatDate(selectedDate)}`}
        >
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
        </Pressable>
        <IconButton
          icon="chevron-right"
          size={20}
          iconColor={colors.textPrimary}
          onPress={() => shiftDate(1)}
          accessibilityLabel="翌日へ"
        />
        <Pressable
          onPress={() => setSelectedDate(new Date())}
          style={styles.todayButton}
        >
          <Text style={styles.todayText}>今日</Text>
        </Pressable>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          onChange={onDateChange}
        />
      )}

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.filterRow,
          presentation.cardVariant === "dense" && styles.filterRowDense,
        ]}
        style={styles.filterScroll}
      >
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setStatusFilter(opt.key)}
            style={[
              styles.filterChip,
              statusFilter === opt.key && styles.filterChipActive,
            ]}
          >
            <Text
              style={[
                styles.filterChipText,
                statusFilter === opt.key && styles.filterChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Reservation list */}
      <FlatList
        data={reservations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={presentation.initialNumToRender}
        maxToRenderPerBatch={presentation.maxToRenderPerBatch}
        windowSize={presentation.windowSize}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={[
          styles.listContent,
          presentation.cardVariant === "dense" && styles.listContentDense,
        ]}
        ListHeaderComponent={
          total > reservations.length ? (
            <View style={styles.limitNotice}>
              <Icon source="information-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.limitNoticeText}>
                先頭{reservations.length}件を表示しています。日付や状態で絞り込んでください。
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="calendar-blank-outline"
            title="予約がありません"
            description={`${formatDate(selectedDate)} の予約はまだありません`}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
  },
  dateButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dateText: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  todayButton: {
    marginLeft: "auto",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  todayText: {
    ...typography.labelSmall,
    color: colors.textOnPrimary,
  },
  filterScroll: {
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderTopWidth: spacing.xs,
    borderTopColor: colors.background,
  },
  filterRow: {
    flexDirection: "row",
    // 日付バーと絞り込みバーは別の操作なので、白どうしがつながって
    // 1つの帯に見えないよう地色（背景）を1本挟む。線で切るのとは違い、
    // 画面を横断する罫線にはならない
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
  },
  filterRowDense: {
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    ...typography.labelSmall,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textOnPrimary,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing["4xl"],
    gap: spacing.sm,
  },
  listContentDense: {
    padding: spacing.sm,
    paddingBottom: spacing["4xl"],
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardSimple: {
    padding: spacing.xl,
  },
  cardDense: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  cardMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardMainDense: {
    gap: spacing.sm,
  },
  cardLeft: {
    width: 56,
    alignItems: "center",
  },
  cardLeftSimple: {
    width: 64,
  },
  cardLeftDense: {
    width: 48,
  },
  time: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  timeSimple: {
    fontSize: 20,
    lineHeight: 26,
  },
  timeDense: {
    fontSize: 14,
    lineHeight: 18,
  },
  cardCenter: { flex: 1 },
  customerName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  customerNameSimple: {
    fontSize: 20,
    lineHeight: 26,
  },
  customerNameDense: {
    fontSize: 14,
    lineHeight: 18,
  },
  vehicleInfo: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  simpleCta: {
    minHeight: sizing.touchTarget,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  simpleCtaText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  limitNotice: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  limitNoticeText: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.textSecondary,
  },
});
