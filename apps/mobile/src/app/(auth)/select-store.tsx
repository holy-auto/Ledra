import { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Text, Card, Button, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";

import { fetchActiveStores, type ActiveStore } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

export default function SelectStoreScreen() {
  const [stores, setStores] = useState<ActiveStore[]>([]);
  const [loading, setLoading] = useState(true);
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
      // 通常のコールドスタートでは useAuthInit が起動処理の中で同じ判定を
      // 済ませているため、店舗が1つのユーザーはこの画面に来ない。
      // ここに来るのは「複数店舗」「0店舗」「設定からの店舗切替」「ログイン直後」。
      const data = await fetchActiveStores(user.tenantId).catch(() => []);

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
  }, [user?.tenantId, handleSelect]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
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
