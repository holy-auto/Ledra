import { useMemo, useState } from "react";
import { View, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { Text, ActivityIndicator, Chip } from "react-native-paper";
import { Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

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

const RANGE_SEGMENTS = [
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
          <SegmentedControl
            segments={RANGE_SEGMENTS}
            value={days}
            onChange={setDays}
          />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          (data ?? []).map((m) => (
            <View key={m.storeId} style={styles.card}>
              <View style={styles.storeHeader}>
                <Text style={styles.storeName}>{m.storeName}</Text>
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
                  <Text style={styles.topMenusLabel}>人気メニュー</Text>
                  {m.topMenus.map((mm, i) => (
                    <View key={mm.name} style={styles.menuRow}>
                      <Text style={styles.menuRank}>{i + 1}</Text>
                      <Text style={styles.menuName} numberOfLines={1}>
                        {mm.name}
                      </Text>
                      <Text style={styles.menuStats}>
                        {mm.count}回 / ¥{mm.sales.toLocaleString()}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {m.txCount === 0 && (
                <Text style={styles.emptyText}>
                  期間内の取引はありません
                </Text>
              )}
            </View>
          ))
        )}

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  controlBar: { padding: spacing.md, paddingBottom: 0 },
  center: { padding: spacing["4xl"], alignItems: "center" },
  card: {
    margin: spacing.md,
    marginBottom: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  storeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  storeName: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  currentChip: { backgroundColor: colors.primaryLight },
  currentChipText: { color: colors.primaryDark, fontSize: 11 },
  metricsRow: {
    flexDirection: "row",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceVariant,
  },
  metric: { flex: 1, alignItems: "center" },
  metricLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metricValue: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  topMenus: { marginTop: spacing.md },
  topMenusLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  menuRank: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: "700",
    width: 20,
  },
  menuName: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.textPrimary,
  },
  menuStats: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
});
