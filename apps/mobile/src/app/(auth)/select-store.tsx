import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Text, Card, Button, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";

import { fetchActiveStores, type ActiveStore } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

export default function SelectStoreScreen() {
  const [stores, setStores] = useState<ActiveStore[]>([]);
  const [loading, setLoading] = useState(true);
  // 取得失敗と「店舗が0個」を区別する。混同すると、通信が切れているだけなのに
  // 「店舗が登録されていません」と表示し、ユーザーが「続行する」を押して
  // selectedStore に空文字IDが入る。空文字IDは certificates/new・reservations/new・
  // customers/new の INSERT で uuid エラーになる（POS 系と違い正規化されていない）。
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { user, setSelectedStore } = useAuthStore();

  const handleSelect = useCallback(
    (store: ActiveStore) => {
      setSelectedStore({ id: store.id, name: store.name });
      router.replace("/(tabs)");
    },
    [setSelectedStore]
  );

  useEffect(() => {
    async function loadStores() {
      if (!user?.tenantId) return;

      // 取得条件は lib/auth.ts の fetchActiveStores に集約している。
      // コールドスタート (useAuthInit) とログイン (login.tsx) は、遷移先を
      // 決める前に同じ判定を済ませている。よって店舗が1つのユーザーは
      // この画面に来ない。ここに来るのは「複数店舗」「0店舗」
      // 「設定からの店舗切替」「新規登録直後（必ず0店舗）」。
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // 取得に失敗したときは「0店舗」と別の画面を出す。
  // ここで「続行する」を出すと、通信断のたびに空文字IDが入り込む。
  if (loadFailed) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">店舗情報を取得できませんでした</Text>
        <Text variant="bodyMedium" style={styles.subtext}>
          通信状況を確認して、もう一度お試しください
        </Text>
        <Button
          mode="contained"
          onPress={() => {
            setLoading(true);
            setLoadFailed(false);
            setReloadKey((n) => n + 1);
          }}
          style={{ marginTop: 24 }}
        >
          再試行
        </Button>
      </View>
    );
  }

  if (stores.length === 0) {
    return (
      <View style={styles.center}>
        <Text variant="titleMedium">店舗が登録されていません</Text>
        <Text variant="bodyMedium" style={styles.subtext}>
          店舗なしで続行するか、管理者に設定を依頼してください
        </Text>
        <Button
          mode="contained"
          onPress={() => {
            // 「店舗なしで続行」モード:
            //   selectedStore を非 null にしないと (tabs)/_layout が
            //   /(auth)/select-store にリダイレクトしてループする。
            //   id は空文字を使うが、pos_checkout 等の RPC 境界で
            //   selectedStore?.id || null に正規化されるので
            //   "invalid input syntax for type uuid" は発生しない。
            setSelectedStore({ id: "", name: user?.tenantName ?? "本店" });
            router.replace("/(tabs)");
          }}
          style={{ marginTop: 24 }}
        >
          続行する
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          店舗を選択
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          {user?.tenantName}
        </Text>
      </View>

      <FlatList
        data={stores}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Card
            style={styles.card}
            onPress={() => handleSelect(item)}
            mode="outlined"
          >
            <Card.Content>
              <Text variant="titleMedium">{item.name}</Text>
              {item.address && (
                <Text variant="bodySmall" style={styles.address}>
                  {item.address}
                </Text>
              )}
              {item.is_default && (
                <Text variant="labelSmall" style={styles.defaultBadge}>
                  デフォルト
                </Text>
              )}
            </Card.Content>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  header: {
    padding: 24,
    paddingTop: 60,
  },
  title: { fontWeight: "700", color: "#1a1a2e" },
  subtitle: { color: "#71717a", marginTop: 4 },
  subtext: { color: "#71717a", marginTop: 8 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: "#ffffff" },
  address: { color: "#71717a", marginTop: 4 },
  defaultBadge: {
    color: "#1a1a2e",
    marginTop: 8,
    backgroundColor: "#e6f4fe",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
});
