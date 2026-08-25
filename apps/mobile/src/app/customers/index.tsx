import { useState, useCallback } from "react";
import { View, FlatList, StyleSheet, Pressable } from "react-native";
import { Text, FAB, ActivityIndicator, Icon } from "react-native-paper";
import { TextInput as RNTextInput } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Customer {
  id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
}

export default function CustomersIndexScreen() {
  const { user } = useAuthStore();
  const [search, setSearch] = useState("");

  const { data: customers, isLoading, refetch } = useQuery({
    queryKey: ["customers", user?.tenantId, search],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id, name, name_kana, phone, email")
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (search.trim()) {
        query = query.or(
          `name.ilike.%${search}%,phone.ilike.%${search}%,name_kana.ilike.%${search}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Customer[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/customers/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.name} ${item.phone ?? ""}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.customerIcon}>
            <Icon source="account" size={20} color={colors.primary} />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.name}>{item.name}</Text>
            {item.name_kana && (
              <Text style={styles.kana}>{item.name_kana}</Text>
            )}
          </View>
        </View>

        <View style={styles.metaRow}>
          {item.phone && (
            <View style={styles.metaItem}>
              <Icon source="phone-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>{item.phone}</Text>
            </View>
          )}
          {item.email && (
            <View style={styles.metaItem}>
              <Icon source="email-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>{item.email}</Text>
            </View>
          )}
        </View>

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
            placeholder="名前・電話番号で検索"
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
          data={customers}
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
                  「{search}」に一致する顧客はありません
                </Text>
              </View>
            ) : (
              <EmptyState
                icon="account-group-outline"
                title="顧客がまだ登録されていません"
                description="顧客を登録すると、車両や証明書と紐付けて管理できます"
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
        onPress={() => router.push("/customers/new")}
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
  customerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: { flex: 1 },
  name: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  kana: {
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
