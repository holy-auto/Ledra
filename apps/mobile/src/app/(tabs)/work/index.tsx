import { useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { Text, Card, Chip } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

type WorkStatus = "arrived" | "in_progress";

interface WorkItem {
  id: string;
  status: WorkStatus;
  scheduled_time: string | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_number: string;
    make: string;
    model: string;
  } | null;
  assigned_staff: { id: string; display_name: string } | null;
}

const STATUS_COLORS: Record<WorkStatus, string> = {
  arrived: "#f59e0b",
  in_progress: "#f97316",
};

const STATUS_LABELS: Record<WorkStatus, string> = {
  arrived: "来店",
  in_progress: "作業中",
};

export default function WorkScreen() {
  const { user, selectedStore } = useAuthStore();

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["work", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId || !selectedStore?.id) return [];

      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id,
          status,
          scheduled_time,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_number, make, model ),
          assigned_staff:staff ( id, display_name )
        `
        )
        .eq("tenant_id", user.tenantId)
        .eq("store_id", selectedStore.id)
        .in("status", ["arrived", "in_progress"])
        .order("scheduled_time", { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as WorkItem[];
    },
    enabled: !!user?.tenantId && !!selectedStore?.id,
    refetchInterval: 30_000,
  });

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const formatTime = (t: string | null) => {
    if (!t) return "--:--";
    return t.slice(0, 5);
  };

  const renderItem = ({ item }: { item: WorkItem }) => (
    <Card
      style={styles.card}
      mode="outlined"
      onPress={() => router.push(`/work/${item.id}`)}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardMain}>
          <View style={styles.cardHeader}>
            <Text variant="titleSmall" style={styles.customerName}>
              {item.customer?.name ?? "未登録"}
            </Text>
            <Chip
              compact
              style={[
                styles.chip,
                {
                  backgroundColor: `${STATUS_COLORS[item.status]}18`,
                },
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

          <Text variant="bodySmall" style={styles.vehicleInfo}>
            {item.vehicle
              ? `${item.vehicle.plate_number}  ${item.vehicle.make} ${item.vehicle.model}`
              : "車両未登録"}
          </Text>

          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={styles.metaText}>
              {formatTime(item.scheduled_time)}
            </Text>
            {item.assigned_staff && (
              <Text variant="bodySmall" style={styles.metaText}>
                担当: {item.assigned_staff.display_name}
              </Text>
            )}
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={styles.emptyText}>
              作業中の予約はありません
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  listContent: { padding: 12, paddingBottom: 24 },
  card: {
    backgroundColor: "#ffffff",
    marginBottom: 8,
  },
  cardContent: {
    paddingVertical: 12,
  },
  cardMain: { flex: 1 },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  customerName: { fontWeight: "600", color: "#1a1a2e" },
  vehicleInfo: { color: "#71717a", marginTop: 2 },
  metaRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 8,
  },
  metaText: { color: "#71717a" },
  chip: {
    borderRadius: 12,
  },
  empty: { alignItems: "center", paddingTop: 48 },
  emptyText: { color: "#71717a" },
});
