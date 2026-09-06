import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";

import { fetchActiveStores, type ActiveStore } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

export default function SelectStoreScreen() {
  const { fromSignup } = useLocalSearchParams<{ fromSignup?: string }>();
  const [stores, setStores] = useState<ActiveStore[]>([]);
  const [loading, setLoading] = useState(true);
  // 取得失敗と「店舗が0個」を区別する。混同すると、通信が切れているだけなのに
  // 「店舗が登録されていません」と表示し、ユーザーが「続行する」を押して
  // selectedStore に空文字IDが入る。空文字IDは certificates/new・reservations/new・
  // customers/new の INSERT で uuid エラーになる（POS 系と違い正規化されていない）。
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { user, setSelectedStore } = useAuthStore();

  const nextRoute = fromSignup === "1" ? "/(auth)/biometric-setup" : "/(tabs)";

  const handleSelect = useCallback(
    (store: ActiveStore) => {
      setSelectedStore({ id: store.id, name: store.name });
      router.replace(nextRoute as never);
    },
    [setSelectedStore, nextRoute]
  );

  useEffect(() => {
    async function loadStores() {
      if (!user?.tenantId) return;

      // 取得条件は lib/auth.ts の fetchActiveStores に集約している。
      // コールドスタート (useAuthInit) とログイン (login.tsx) は、遷移先を
      // 決める前に同じ判定 (resolveDefaultStore) を済ませている。よって
      // 通常は「複数店舗」「0店舗」「設定からの店舗切替」「新規登録直後
      // （必ず0店舗）」だけがここに来る。
      //
      // ただし resolveDefaultStore は取得失敗を握りつぶして null を返すので、
      // 通信が切れていた1店舗のユーザーもここに来る。下の
      // data.length === 1 の自動選択は「もう通らない分岐」ではない。
      // 消すと、再試行で復帰した1店舗ユーザーが毎回カード1枚の画面を
      // 手でタップすることになる。
      let data: ActiveStore[];
      try {
        data = await fetchActiveStores(user.tenantId);
      } catch (e) {
        console.warn(
          "fetchActiveStores failed:",
          e instanceof Error ? e.message : e,
        );
        setStores([]);
        setLoadFailed(true);
        setLoading(false);
        return;
      }

      setLoadFailed(false);
      setStores(data);

      // 店舗が1つだけならスキップ
      if (data.length === 1) {
        handleSelect(data[0]);
        return;
      }

      // デフォルト店舗があれば自動選択オプション
      // （ここではユーザーに選ばせる）
      setLoading(false);
    }

    loadStores();
  }, [user?.tenantId, handleSelect, reloadKey]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // 取得に失敗したときは「0店舗」と別の画面を出す。
  // ここで「続行する」を出すと、通信断のたびに空文字IDが入り込む。
  if (loadFailed) {
    return (
      <View style={styles.center}>
        <Icon source="wifi-off" size={48} color={colors.textTertiary} />
        <Text style={styles.emptyTitle}>店舗情報を取得できませんでした</Text>
        <Text style={styles.emptyDesc}>
          通信状況を確認して、もう一度お試しください
        </Text>
        <LedraButton
          onPress={() => {
            setLoading(true);
            setLoadFailed(false);
            setReloadKey((n) => n + 1);
          }}
          style={styles.continueButton}
        >
          再試行
        </LedraButton>
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
