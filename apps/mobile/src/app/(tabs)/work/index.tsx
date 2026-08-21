import { useCallback } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

type WorkStatus = "arrived" | "in_progress" | "completed";

interface WorkItem {
  id: string;
  status: WorkStatus;
  scheduled_date: string | null;
  scheduled_time: string | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_number: string;
    make: string;
    model: string;
  } | null;
  assigned_staff: { id: string; display_name: string } | null;
  reservation_items: { menu_item: { name: string } | null }[];
}

const STATUS_CONFIG: Record<
  WorkStatus,
  { label: string; severity: "warning" | "info" | "success" }
> = {
  arrived: { label: "来店", severity: "warning" },
  in_progress: { label: "作業中", severity: "info" },
  completed: { label: "完了", severity: "success" },
};

export default function WorkScreen() {
  const { user, selectedStore } = useAuthStore();

  const {
    data: items = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["work", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId || !selectedStore?.id) return [];

      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id, status, scheduled_date, scheduled_time,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_number, make, model ),
          assigned_staff:staff ( id, display_name ),
          reservation_items ( menu_item:menu_items ( name ) )
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
    try {
      await refetch();
    } catch {
      // ponytail: swallow — pull-to-refresh spinner handled by isLoading
    }
  }, [refetch]);

  const formatTime = (t: string | null) => {
    if (!t) return "--:--";
    return t.slice(0, 5);
  };

  const renderItem = ({ item }: { item: WorkItem }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.arrived;
    const serviceNames = item.reservation_items
      ?.map((ri) => ri.menu_item?.name)
      .filter(Boolean)
      .join("、");

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/work/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.vehicle?.plate_number ?? "車両不明"} ${cfg.label}`}
      >
        {/* Top row: vehicle + status */}
        <View style={styles.cardHeader}>
          <View style={styles.vehicleIcon}>
            <Icon source="car" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.plateText}>
              {item.vehicle?.plate_number ?? "車両未登録"}
            </Text>
            <Text style={styles.vehicleModel} numberOfLines={1}>
              {item.vehicle
                ? `${item.vehicle.make} ${item.vehicle.model}`
                : ""}
            </Text>
          </View>
          <StatusBadge label={cfg.label} severity={cfg.severity} />
        </View>

        {/* Service info */}
        {serviceNames ? (
          <Text style={styles.serviceText} numberOfLines={1}>
            {serviceNames}
          </Text>
        ) : null}

        {/* Bottom row: time + customer + staff */}
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon source="clock-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{formatTime(item.scheduled_time)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon source="account-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {item.customer?.name ?? "未登録"}
            </Text>
          </View>
          {item.assigned_staff && (
            <View style={styles.metaItem}>
              <Icon source="wrench-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>
                {item.assigned_staff.display_name}
              </Text>
            </View>
          )}
        </View>

        {/* Chevron */}
        <View style={styles.chevron}>
          <Icon source="chevron-right" size={20} color={colors.textTertiary} />
        </View>
      </Pressable>
    );
  };

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
            <Icon source="wrench-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>作業中の予約はありません</Text>
            <Text style={styles.emptyDesc}>
              入庫した車両がここに表示されます
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, paddingBottom: spacing["3xl"], gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
    position: "relative",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: { flex: 1 },
  plateText: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  vehicleModel: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  serviceText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: 52, // aligned with text after icon
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
    marginLeft: 52,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaText: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  chevron: {
    position: "absolute",
    right: spacing.lg,
    top: "50%",
    marginTop: -10,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
