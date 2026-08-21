import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

interface Store {
  id: string;
  name: string;
  address: string | null;
  is_default: boolean;
}

export default function SelectStoreScreen() {
  const { fromSignup } = useLocalSearchParams<{ fromSignup?: string }>();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, setSelectedStore } = useAuthStore();

  const nextRoute = fromSignup === "1" ? "/(auth)/biometric-setup" : "/(tabs)";

  const handleSelect = useCallback(
    (store: Store) => {
      setSelectedStore({ id: store.id, name: store.name });
      router.replace(nextRoute as never);
    },
    [setSelectedStore, nextRoute]
  );

  useEffect(() => {
    async function loadStores() {
      if (!user?.tenantId) return;

      const { data } = await supabase
        .from("stores")
        .select("id, name, address, is_default")
        .eq("tenant_id", user.tenantId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("sort_order");

      if (data) {
        setStores(data);

        // 店舗が1つだけならスキップ
        if (data.length === 1) {
          handleSelect(data[0]);
          return;
        }

        // デフォルト店舗があれば自動選択オプション
        // （ここではユーザーに選ばせる）
      }

      setLoading(false);
    }

    loadStores();
  }, [user?.tenantId, handleSelect]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (stores.length === 0) {
    return (
      <View style={styles.center}>
        <Icon source="store-off-outline" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>店舗が登録されていません</Text>
        <Text style={styles.emptyDesc}>
          店舗なしで続行するか、管理者に設定を依頼してください
        </Text>
        <LedraButton
          onPress={() => {
            // 「店舗なしで続行」モード:
            //   selectedStore を非 null にしないと (tabs)/_layout が
            //   /(auth)/select-store にリダイレクトしてループする。
            //   id は空文字を使うが、pos_checkout 等の RPC 境界で
            //   selectedStore?.id || null に正規化されるので
            //   "invalid input syntax for type uuid" は発生しない。
            setSelectedStore({ id: "", name: user?.tenantName ?? "本店" });
            router.replace(nextRoute as never);
          }}
          style={styles.continueButton}
        >
          続行する
        </LedraButton>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Branded header bar */}
      <View style={styles.brandBar}>
        <Text style={styles.brandTitle}>Ledra</Text>
      </View>

      <View style={styles.headerSection}>
        <Text style={styles.screenTitle}>店舗を選択</Text>
        <Text style={styles.tenantName}>{user?.tenantName}</Text>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => handleSelect(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}を選択`}
          >
            <View style={styles.storeIcon}>
              <Icon source="store" size={sizing.iconMd} color={colors.primary} />
            </View>
            <View style={styles.cardContent}>
              <Text style={styles.storeName}>{item.name}</Text>
              {item.address && (
                <Text style={styles.storeAddress} numberOfLines={1}>
                  {item.address}
                </Text>
              )}
              {item.is_default && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>デフォルト</Text>
                </View>
              )}
            </View>
            <Icon source="chevron-right" size={sizing.iconMd} color={colors.textTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["2xl"],
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  brandBar: {
    backgroundColor: colors.primary,
    paddingTop: 56,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing["2xl"],
    alignItems: "center",
  },
  brandTitle: {
    ...typography.titleLarge,
    color: colors.textOnPrimary,
    letterSpacing: 2,
  },
  headerSection: {
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["2xl"],
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  tenantName: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  list: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.card,
  },
  storeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
  },
  storeName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  storeAddress: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  defaultBadge: {
    backgroundColor: colors.primaryLight,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  defaultBadgeText: {
    ...typography.labelSmall,
    color: colors.primary,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
  },
  continueButton: {
    marginTop: spacing["2xl"],
  },
});
