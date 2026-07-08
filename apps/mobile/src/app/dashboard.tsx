import { useMemo, useState } from "react";
import { View, ScrollView, StyleSheet, RefreshControl } from "react-native";
import {
  Text,
  Card,
  ActivityIndicator,
  Chip,
  SegmentedButtons,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface StoreRow {
  id: string;
  name: string;
}

interface PaymentRow {
  store_id: string | null;
  amount: number;
  paid_at: string;
  reservation_id: string;
}

interface ReservationItemRow {
  reservation_id: string;
  unit_price: number;
  quantity: number;
  menu_item: { name: string } | null;
}

interface StoreMetrics {
  storeId: string;
  storeName: string;
  totalSales: number;
  txCount: number;
  avgTicket: number;
  topMenus: { name: string; count: number; sales: number }[];
}

const RANGE_OPTIONS = [
  { value: "7", label: "7日" },
  { value: "30", label: "30日" },
  { value: "90", label: "90日" },
];

export default function StoreDashboardScreen() {
  const { user, selectedStore } = useAuthStore();
  const [days, setDays] = useState("30");
  const [refreshing, setRefreshing] = useState(false);

  const fromIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(days, 10));
    return d.toISOString();
  }, [days]);

  const { data, isLoading, refetch } = useQuery<StoreMetrics[]>({
    queryKey: ["store-dashboard", user?.tenantId, days],
    queryFn: async () => {
      if (!user?.tenantId) return [];

      // 1) tenant 内の全店舗
      const { data: storeRows, error: storeErr } = await supabase
        .from("stores")
        .select("id, name")
        .eq("tenant_id", user.tenantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (storeErr) throw storeErr;
      const stores = (storeRows ?? []) as StoreRow[];

      // 2) 期間内の payments を tenant 全体で取得
      const { data: payRows, error: payErr } = await supabase
        .from("payments")
        .select("store_id, amount, paid_at, reservation_id")
        .eq("tenant_id", user.tenantId)
        .gte("paid_at", fromIso);
      if (payErr) throw payErr;
      const payments = (payRows ?? []) as PaymentRow[];

      // 3) 決済済み予約の menu_items_json を取得 (人気メニュー集計用)。
      //    明細は reservations.menu_items_json ({ menu_item_id, name, price }) に保存されている。
      const reservationIds = Array.from(
        new Set(payments.map((p) => p.reservation_id).filter(Boolean))
      );
      let items: ReservationItemRow[] = [];
      if (reservationIds.length > 0) {
        const { data: resvRows } = await supabase
          .from("reservations")
          .select("id, menu_items_json")
          .in("id", reservationIds);
        items = (resvRows ?? []).flatMap(
          (r: { id: string; menu_items_json: unknown }) =>
            Array.isArray(r.menu_items_json)
              ? (r.menu_items_json as { name?: string; price?: number }[]).map(
                  (mi) => ({
                    reservation_id: r.id,
                    unit_price: typeof mi.price === "number" ? mi.price : 0,
                    quantity: 1,
                    menu_item: { name: mi.name ?? "未設定" },
                  })
                )
              : []
        );
      }

      // 4) 店舗ごとに集計
      return stores.map((s): StoreMetrics => {
        const sp = payments.filter((p) => p.store_id === s.id);
        const totalSales = sp.reduce((sum, p) => sum + p.amount, 0);
        const txCount = sp.length;
        const avgTicket = txCount === 0 ? 0 : Math.round(totalSales / txCount);

        const storeReservationIds = new Set(sp.map((p) => p.reservation_id));
        const storeItems = items.filter((it) =>
          storeReservationIds.has(it.reservation_id)
        );

        // メニュー名で集計
        const byMenu: Record<string, { count: number; sales: number }> = {};
        for (const it of storeItems) {
          const name = it.menu_item?.name ?? "未設定";
          const entry = byMenu[name] ?? { count: 0, sales: 0 };
          entry.count += it.quantity;
          entry.sales += it.unit_price * it.quantity;
          byMenu[name] = entry;
        }
        const topMenus = Object.entries(byMenu)
          .map(([name, v]) => ({ name, count: v.count, sales: v.sales }))
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 3);

        return {
          storeId: s.id,
          storeName: s.name,
          totalSales,
          txCount,
          avgTicket,
          topMenus,
        };
      });
    },
    enabled: !!user?.tenantId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <>
      <Stack.Screen options={{ title: "店舗ダッシュボード", headerShown: true }} />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.controlBar}>
          <SegmentedButtons
            value={days}
            onValueChange={setDays}
            buttons={RANGE_OPTIONS}
            density="small"
          />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          (data ?? []).map((m) => (
            <Card key={m.storeId} style={styles.card} mode="outlined">
              <Card.Content>
                <View style={styles.storeHeader}>
                  <Text variant="titleMedium" style={styles.storeName}>
                    {m.storeName}
                  </Text>
                  {selectedStore?.id === m.storeId && (
                    <Chip
                      compact
                      style={styles.currentChip}
                      textStyle={styles.currentChipText}
                    >
                      現在
                    </Chip>
                  )}
                </View>

                <View style={styles.metricsRow}>
                  <Metric
                    label="売上合計"
                    value={`¥${m.totalSales.toLocaleString()}`}
                  />
                  <Metric label="取引数" value={`${m.txCount}件`} />
                  <Metric
                    label="客単価"
                    value={`¥${m.avgTicket.toLocaleString()}`}
                  />
                </View>

                {m.topMenus.length > 0 && (
                  <View style={styles.topMenus}>
                    <Text variant="labelSmall" style={styles.topMenusLabel}>
                      人気メニュー
                    </Text>
                    {m.topMenus.map((mm, i) => (
                      <View key={mm.name} style={styles.menuRow}>
                        <Text variant="bodySmall" style={styles.menuRank}>
                          {i + 1}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={styles.menuName}
                          numberOfLines={1}
                        >
                          {mm.name}
                        </Text>
                        <Text variant="bodySmall" style={styles.menuStats}>
                          {mm.count}回 / ¥{mm.sales.toLocaleString()}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                {m.txCount === 0 && (
                  <Text variant="bodySmall" style={styles.emptyText}>
                    期間内の取引はありません
                  </Text>
                )}
              </Card.Content>
            </Card>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="labelSmall" style={styles.metricLabel}>
        {label}
      </Text>
      <Text variant="titleSmall" style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  controlBar: { padding: 12, paddingBottom: 0 },
  center: { padding: 48, alignItems: "center" },
  card: { margin: 12, marginBottom: 0, backgroundColor: "#ffffff" },
  storeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  storeName: { fontWeight: "700", color: "#1a1a2e" },
  currentChip: { backgroundColor: "#dbeafe" },
  currentChipText: { color: "#1e40af", fontSize: 11 },
  metricsRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f4f4f5",
    borderBottomWidth: 1,
    borderBottomColor: "#f4f4f5",
  },
  metric: { flex: 1, alignItems: "center" },
  metricLabel: { color: "#71717a", marginBottom: 4 },
  metricValue: { fontWeight: "700", color: "#1a1a2e" },
  topMenus: { marginTop: 12 },
  topMenusLabel: { color: "#71717a", marginBottom: 6 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  menuRank: {
    color: "#1a1a2e",
    fontWeight: "700",
    width: 20,
  },
  menuName: { flex: 1, color: "#1a1a2e" },
  menuStats: { color: "#71717a" },
  emptyText: {
    color: "#71717a",
    textAlign: "center",
    marginTop: 12,
    paddingVertical: 12,
  },
});
