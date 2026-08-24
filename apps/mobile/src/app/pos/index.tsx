import { useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, Chip, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { scopeToStore } from "@/lib/storeScope";
import { parseMenuItems } from "@/lib/reservationItems";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface PosItem {
  id: string;
  status: string;
  payment_status: string;
  estimated_amount: number | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_display: string;
    maker: string;
    model: string;
  } | null;
  menu_items_json: unknown;
}

export default function PosScreen() {
  const { user, selectedStore } = useAuthStore();

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["pos", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId) return [];

      let query = supabase
        .from("reservations")
        .select(
          `
          id,
          status,
          payment_status,
          estimated_amount,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_display, maker, model ),
          menu_items_json
        `
        )
        .eq("tenant_id", user.tenantId)
        .eq("status", "completed")
        .eq("payment_status", "unpaid")
        .order("updated_at", { ascending: false });

      query = scopeToStore(query, selectedStore?.id);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as PosItem[];
    },
    enabled: !!user?.tenantId,
    refetchInterval: 30_000,
  });

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const formatAmount = (amount: number | null) => {
    if (amount == null) return "---";
    return `¥${amount.toLocaleString()}`;
  };

  const getMenuSummary = (item: PosItem) => {
    const names = parseMenuItems(item.menu_items_json).map((m) => m.name);
    if (names.length === 0) return "メニュー未設定";
    if (names.length <= 2) return names.join("、");
    return `${names[0]}、${names[1]} 他${names.length - 2}件`;
  };

  const renderItem = ({ item }: { item: PosItem }) => (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/pos/checkout/${item.id}`)}
      accessibilityRole="button"
    >
      <View style={styles.cardHeader}>
        <Text style={styles.customerName}>
          {item.customer?.name ?? "未登録"}
        </Text>
        <Chip
          compact
          style={styles.unpaidChip}
        >
          <Text style={styles.unpaidText}>未払い</Text>
        </Chip>
      </View>

      <Text style={styles.vehicleInfo}>
        {item.vehicle
          ? `${item.vehicle.plate_display}  ${item.vehicle.maker} ${item.vehicle.model}`
          : "車両未登録"}
      </Text>

      <Text style={styles.menuSummary} numberOfLines={1}>
        {getMenuSummary(item)}
      </Text>

      <View style={styles.amountRow}>
        <Text style={styles.amount}>
          {formatAmount(item.estimated_amount)}
        </Text>
      </View>
    </Pressable>
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
        ListHeaderComponent={
          <Pressable
            style={styles.walkInCard}
            onPress={() => router.push("/pos/walk-in")}
            accessibilityRole="button"
          >
            <View style={styles.walkInContent}>
              <View style={styles.walkInIcon}>
                <Icon source="plus-circle" size={24} color={colors.textOnPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.walkInTitle}>
                  新規会計（飛び込み）
                </Text>
                <Text style={styles.walkInSub}>
                  予約なしのお客様の会計を作成
                </Text>
              </View>
              <Icon source="chevron-right" size={24} color={colors.textTertiary} />
            </View>
          </Pressable>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="cash-register" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>会計待ちの予約はありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingBottom: spacing["3xl"], gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  customerName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  vehicleInfo: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  menuSummary: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
  },
  amount: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  unpaidChip: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
  },
  unpaidText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: "600",
  },
  walkInCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  walkInContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  walkInIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  walkInTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  walkInSub: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
});
