import { useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import { Text, Card, Chip } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface PosItem {
  id: string;
  status: string;
  payment_status: string;
  estimated_amount: number | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_number: string;
    make: string;
    model: string;
  } | null;
  reservation_items: {
    id: string;
    menu_item: { name: string } | null;
  }[];
}

export default function PosScreen() {
  const { user, selectedStore } = useAuthStore();

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey: ["pos", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId || !selectedStore?.id) return [];

      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id,
          status,
          payment_status,
          estimated_amount,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_number, make, model ),
          reservation_items (
            id,
            menu_item:menu_items ( name )
          )
        `
        )
        .eq("tenant_id", user.tenantId)
        .eq("store_id", selectedStore.id)
        .eq("status", "completed")
        .eq("payment_status", "unpaid")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as PosItem[];
    },
    enabled: !!user?.tenantId && !!selectedStore?.id,
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
    const names = item.reservation_items
      .map((ri) => ri.menu_item?.name)
      .filter(Boolean);
    if (names.length === 0) return "メニュー未設定";
    if (names.length <= 2) return names.join("、");
    return `${names[0]}、${names[1]} 他${names.length - 2}件`;
  };

  const renderItem = ({ item }: { item: PosItem }) => (
    <Card
      style={styles.card}
      mode="outlined"
      onPress={() => router.push(`/pos/checkout/${item.id}`)}
    >
      <Card.Content style={styles.cardContent}>
        <View style={styles.cardMain}>
          <View style={styles.cardHeader}>
            <Text variant="titleSmall" style={styles.customerName}>
              {item.customer?.name ?? "未登録"}
            </Text>
            <Chip
              compact
              style={[styles.chip, { backgroundColor: "#ef444418" }]}
            >
              <Text style={styles.unpaidText}>未払い</Text>
            </Chip>
          </View>

          <Text variant="bodySmall" style={styles.vehicleInfo}>
            {item.vehicle
              ? `${item.vehicle.plate_number}  ${item.vehicle.make} ${item.vehicle.model}`
              : "車両未登録"}
          </Text>

          <Text variant="bodySmall" style={styles.menuSummary} numberOfLines={1}>
            {getMenuSummary(item)}
          </Text>

          <View style={styles.amountRow}>
            <Text variant="titleMedium" style={styles.amount}>
              {formatAmount(item.estimated_amount)}
            </Text>
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
              会計待ちの予約はありません
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
  menuSummary: { color: "#71717a", marginTop: 4 },
  amountRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 8,
  },
  amount: { fontWeight: "700", color: "#1a1a2e" },
  chip: {
    borderRadius: 12,
  },
  unpaidText: {
    color: "#ef4444",
    fontSize: 11,
    fontWeight: "600",
  },
  empty: { alignItems: "center", paddingTop: 48 },
  emptyText: { color: "#71717a" },
});
