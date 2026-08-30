import { useState, useCallback } from "react";
import dayjs from "dayjs";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, IconButton } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { scopeToStore } from "@/lib/storeScope";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  colors,
  spacing,
  radius,
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

  // 見出しの formatDate はローカル日付なので、クエリも揃える（UTC だと前日を引く）
  const dateStr = dayjs(selectedDate).format("YYYY-MM-DD");

  const {
    data: reservations = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      "reservations",
      user?.tenantId,
      selectedStore?.id,
      dateStr,
      statusFilter,
    ],
    queryFn: async () => {
      if (!user?.tenantId) return [];

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
        `
        )
        .eq("tenant_id", user.tenantId)
        .eq("scheduled_date", dateStr)
        .order("start_time", { ascending: true });

      query = scopeToStore(query, selectedStore?.id);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Reservation[];
    },
    enabled: !!user?.tenantId,
  });

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

  const renderItem = ({ item }: { item: Reservation }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/reservations/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.customer?.name ?? "未登録"} ${formatTime(item.start_time)}`}
    >
      <View style={styles.cardLeft}>
        <Text style={styles.time}>{formatTime(item.start_time)}</Text>
      </View>
      <View style={styles.cardCenter}>
        <Text style={styles.customerName} numberOfLines={1}>
          {item.customer?.name ?? "未登録"}
        </Text>
        <Text style={styles.vehicleInfo} numberOfLines={1}>
          {item.vehicle
            ? `${item.vehicle.plate_display}  ${item.vehicle.maker} ${item.vehicle.model}`
            : "車両未登録"}
        </Text>
      </View>
      <StatusBadge
        label={STATUS_LABELS[item.status]}
        severity={STATUS_SEVERITY[item.status]}
        compact
      />
    </Pressable>
  );

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
      <View style={styles.filterRow}>
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
      </View>

      {/* Reservation list */}
      <FlatList
        data={reservations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
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
  filterRow: {
    flexDirection: "row",
    // 日付バーと絞り込みバーは別の操作なので、白どうしがつながって
    // 1つの帯に見えないよう地色（背景）を1本挟む。線で切るのとは違い、
    // 画面を横断する罫線にはならない
    borderTopWidth: spacing.xs,
    borderTopColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardLeft: {
    width: 56,
    alignItems: "center",
  },
  time: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  cardCenter: { flex: 1 },
  customerName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  vehicleInfo: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
