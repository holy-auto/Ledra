import { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Card, Chip, FAB, IconButton } from "react-native-paper";
import { router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DateTimePicker from "@react-native-community/datetimepicker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

type ReservationStatus =
  | "confirmed"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

interface Reservation {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: ReservationStatus;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_number: string;
    make: string;
    model: string;
  } | null;
}

const STATUS_COLORS: Record<ReservationStatus, string> = {
  confirmed: "#3b82f6",
  arrived: "#f59e0b",
  in_progress: "#f97316",
  completed: "#10b981",
  cancelled: "#ef4444",
};

const STATUS_LABELS: Record<ReservationStatus, string> = {
  confirmed: "確認済",
  arrived: "来店",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
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
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const dateStr = selectedDate.toISOString().split("T")[0];

  const { data: reservations = [], isLoading, refetch } = useQuery({
    queryKey: ["reservations", user?.tenantId, selectedStore?.id, dateStr, statusFilter],
    queryFn: async () => {
      if (!user?.tenantId || !selectedStore?.id) return [];

      let query = supabase
        .from("reservations")
        .select(
          `
          id,
          scheduled_date,
          scheduled_time,
          status,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_number, make, model )
        `
        )
        .eq("tenant_id", user.tenantId)
        .eq("store_id", selectedStore.id)
        .eq("scheduled_date", dateStr)
        .order("scheduled_time", { ascending: true });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Reservation[];
    },
    enabled: !!user?.tenantId && !!selectedStore?.id,
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
    <Card
      style={styles.card}
      mode="outlined"
      onPress={() => router.push(`/reservations/${item.id}`)}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardLeft}>
          <Text variant="titleMedium" style={styles.time}>
            {formatTime(item.scheduled_time)}
          </Text>
        </View>
        <View style={styles.cardCenter}>
          <Text variant="titleSmall" style={styles.customerName}>
            {item.customer?.name ?? "未登録"}
          </Text>
          <Text variant="bodySmall" style={styles.vehicleInfo}>
            {item.vehicle
              ? `${item.vehicle.plate_number}  ${item.vehicle.make} ${item.vehicle.model}`
              : "車両未登録"}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Chip
            compact
            textStyle={styles.chipText}
            style={[
              styles.chip,
              { backgroundColor: `${STATUS_COLORS[item.status]}18` },
            ]}
          >
            <Text
              style={{
                color: STATUS_COLORS[item.status],
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              {STATUS_LABELS[item.status]}
            </Text>
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      {/* Date picker row */}
      <View style={styles.dateRow}>
        <IconButton icon="chevron-left" size={20} onPress={() => shiftDate(-1)} />
        <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateButton}>
          <Text variant="titleSmall" style={styles.dateText}>
            {formatDate(selectedDate)}
          </Text>
        </Pressable>
        <IconButton icon="chevron-right" size={20} onPress={() => shiftDate(1)} />
        <Pressable
          onPress={() => setSelectedDate(new Date())}
          style={styles.todayButton}
        >
          <Text variant="labelSmall" style={styles.todayText}>
            今日
          </Text>
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
          <Chip
            key={opt.key}
            selected={statusFilter === opt.key}
            onPress={() => setStatusFilter(opt.key)}
            compact
            style={[
              styles.filterChip,
              statusFilter === opt.key && styles.filterChipActive,
            ]}
            textStyle={[
              styles.filterChipText,
              statusFilter === opt.key && styles.filterChipTextActive,
            ]}
          >
            {opt.label}
          </Chip>
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
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              予約がありません
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        color="#ffffff"
        onPress={() => router.push("/reservations/new")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  dateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateText: { fontWeight: "700", color: "#1a1a2e" },
  todayButton: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#1a1a2e",
  },
  todayText: { color: "#ffffff", fontWeight: "600" },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  filterChip: {
    backgroundColor: "#f4f4f5",
  },
  filterChipActive: {
    backgroundColor: "#1a1a2e",
  },
  filterChipText: {
    fontSize: 12,
    color: "#71717a",
  },
  filterChipTextActive: {
    color: "#ffffff",
  },
  listContent: { padding: 12, paddingBottom: 80 },
  card: {
    backgroundColor: "#ffffff",
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  cardLeft: {
    width: 56,
    alignItems: "center",
  },
  time: { fontWeight: "700", color: "#1a1a2e" },
  cardCenter: { flex: 1, paddingHorizontal: 8 },
  customerName: { fontWeight: "600", color: "#1a1a2e" },
  vehicleInfo: { color: "#71717a", marginTop: 2 },
  cardRight: { paddingLeft: 8 },
  chip: {
    borderRadius: 12,
  },
  chipText: { fontSize: 11 },
  empty: { alignItems: "center", paddingTop: 48 },
  emptyText: { color: "#71717a" },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#1a1a2e",
    borderRadius: 28,
  },
});
