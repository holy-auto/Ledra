import { useEffect, useState } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Text, Card, Button, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface Store {
  id: string;
  name: string;
  address: string | null;
  is_default: boolean;
}

export default function SelectStoreScreen() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, setSelectedStore } = useAuthStore();

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
  }, [user?.tenantId]);

  function handleSelect(store: Store) {
    setSelectedStore({ id: store.id, name: store.name });
    router.replace("/(tabs)");
  }

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
        <Text variant="titleMedium">店舗が見つかりません</Text>
        <Text variant="bodyMedium" style={styles.subtext}>
          管理者に店舗の設定を依頼してください
        </Text>
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
