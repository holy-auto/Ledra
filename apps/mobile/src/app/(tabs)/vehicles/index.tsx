import { useCallback, useState } from "react";
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
import { EmptyState } from "@/components/EmptyState";
import { useTabContentInset } from "@/hooks/useTabContentInset";
import { TabTopBar } from "@/components/TabTopBar";
import { colors, spacing, radius, sizing, typography, shadows } from "@/constants/tokens";

interface VehicleItem {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customers: { name: string | null } | null;
  certificates: { id: string }[];
}

export default function VehiclesScreen() {
  const tabInset = useTabContentInset();
  const { user, selectedStore } = useAuthStore();
  const [search, setSearch] = useState("");

  const {
    data: vehicles = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["vehicles", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId) return [];

      const q = supabase
        .from("vehicles")
        // vehicles に customer_name 列は無い（あるのは customer_id）。
        // 顧客名は customers を埋め込んで取る（管理画面と同じ）
        .select(
          `id, maker, model, year, plate_display,
           customers ( name ),
           certificates ( id )`
        )
        .eq("tenant_id", user.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as VehicleItem[];
    },
    enabled: !!user?.tenantId,
    refetchInterval: 60_000,
  });

  const filtered = search.trim()
    ? vehicles.filter((v) => {
        // trim 前で比較すると日本語変換確定後の末尾スペースで0件になる
        const q = search.trim().toLowerCase();
        return (
          v.plate_display?.toLowerCase().includes(q) ||
          v.maker?.toLowerCase().includes(q) ||
          v.model?.toLowerCase().includes(q) ||
          v.customers?.name?.toLowerCase().includes(q)
        );
      })
    : vehicles;

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ponytail: swallow — pull-to-refresh spinner handled by isLoading
    }
  }, [refetch]);

  const renderItem = ({ item }: { item: VehicleItem }) => {
    const certCount = item.certificates?.length ?? 0;

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/vehicles/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.plate_display ?? "車両"} ${item.maker ?? ""} ${item.model ?? ""}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.vehicleIcon}>
            <Icon source="car" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.plateText}>
              {item.plate_display ?? "ナンバー未登録"}
            </Text>
            <Text style={styles.vehicleModel} numberOfLines={1}>
              {[item.maker, item.model, item.year].filter(Boolean).join(" ")}
            </Text>
          </View>
          {certCount > 0 && (
            <StatusBadge
              label={`証明書 ${certCount}`}
              severity="success"
              compact
            />
          )}
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {item.customers?.name && (
            <View style={styles.metaItem}>
              <Icon
                source="account-outline"
                size={14}
                color={colors.textTertiary}
              />
              <Text style={styles.metaText}>{item.customers.name}</Text>
            </View>
          )}
        </View>

        <View style={styles.chevron}>
          <Icon source="chevron-right" size={20} color={colors.textTertiary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <TabTopBar
        search={search}
        onSearchChange={setSearch}
        placeholder="ナンバー・メーカー・車種で検索"
      />
      <FlatList
        data={filtered}
        // 検索中の1タップ目がキーボード閉じに吸われないように
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: tabInset }]}
        ListEmptyComponent={
          search.trim() ? (
            <View style={styles.empty}>
              <Icon source="magnify" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                「{search}」に一致する車両はありません
              </Text>
            </View>
          ) : (
            <EmptyState
              icon="car-outline"
              title="車両がまだ登録されていません"
              description="車両を登録すると、作業履歴や証明書と紐付けて管理できます"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
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
    textAlign: "center",
  },
});
