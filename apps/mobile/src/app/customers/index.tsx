import { useState, useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Searchbar, Card, Text, FAB, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

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
      <Card
        style={styles.card}
        mode="outlined"
        onPress={() => router.push(`/customers/${item.id}`)}
      >
        <Card.Content>
          <Text variant="titleMedium" style={styles.name}>
            {item.name}
          </Text>
          {item.name_kana && (
            <Text variant="bodySmall" style={styles.kana}>
              {item.name_kana}
            </Text>
          )}
          {item.phone && (
            <Text variant="bodySmall" style={styles.sub}>
              {item.phone}
            </Text>
          )}
          {item.email && (
            <Text variant="bodySmall" style={styles.sub}>
              {item.email}
            </Text>
          )}
        </Card.Content>
      </Card>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="名前・電話番号で検索"
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />
      {isLoading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={styles.empty}>顧客が見つかりません</Text>
          }
        />
      )}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push("/customers/new")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  searchbar: { margin: 12, backgroundColor: "#ffffff" },
  list: { padding: 12, paddingBottom: 80 },
  card: { marginBottom: 8, backgroundColor: "#ffffff" },
  name: { fontWeight: "700", color: "#1a1a2e" },
  kana: { color: "#71717a", marginTop: 2 },
  sub: { color: "#71717a", marginTop: 2 },
  loading: { marginTop: 32 },
  empty: { textAlign: "center", color: "#71717a", marginTop: 32 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#1a1a2e",
  },
});
