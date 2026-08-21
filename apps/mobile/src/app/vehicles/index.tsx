import { useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput as RNTextInput,
} from "react-native";
import { Text, FAB, ActivityIndicator, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  year: number | null;
  customer_name: string | null;
}

export default function VehiclesIndexScreen() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");

  const { data: vehicles, isLoading, refetch } = useQuery({
    queryKey: ["vehicles", user?.tenantId, search],
    queryFn: async () => {
      let query = supabase
        .from("vehicles")
        .select("id, plate_display, maker, model, year, customer_name")
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (search.trim()) {
        query = query.or(
          `plate_display.ilike.%${search}%,maker.ilike.%${search}%,model.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Vehicle[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: Vehicle }) => (
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
            <Text style={styles.title}>
              {item.maker} {item.model}
            </Text>
            <Text style={styles.sub}>
              {item.plate_display} {item.year ? `(${item.year})` : ""}
            </Text>
          </View>
        </View>

        {item.customer_name && (
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Icon source="account-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>{item.customer_name}</Text>
            </View>
          </View>
        )}

        <View style={styles.chevron}>
          <Icon source="chevron-right" size={20} color={colors.textTertiary} />
        </View>
      </Pressable>
    ),
    []
  );

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Icon source="magnify" size={20} color={colors.textTertiary} />
          <RNTextInput
            style={styles.searchInput}
            placeholder="ナンバー・メーカー・車種で検索"
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Icon source="close-circle" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isLoading}
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
      )}
      <FAB
        icon="plus"
        label="新規"
        style={styles.fab}
        color={colors.textOnPrimary}
        onPress={() => router.push("/vehicles/new")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    padding: 0,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
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
  title: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  sub: {
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
  loading: { marginTop: spacing["3xl"] },
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
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing["2xl"],
    backgroundColor: colors.primary,
    ...shadows.fab,
  },
});
