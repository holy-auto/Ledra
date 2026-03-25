import { useState, useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Searchbar, Card, Text, FAB, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

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
      <Card
        style={styles.card}
        mode="outlined"
        onPress={() => router.push(`/vehicles/${item.id}`)}
      >
        <Card.Content>
          <Text variant="titleMedium" style={styles.title}>
            {item.maker} {item.model}
          </Text>
          <Text variant="bodySmall" style={styles.sub}>
            {item.plate_display} {item.year ? `(${item.year})` : ""}
          </Text>
          {item.customer_name && (
            <Text variant="bodySmall" style={styles.owner}>
              {item.customer_name}
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
        placeholder="ナンバー・メーカー・車種で検索"
        value={search}
        onChangeText={setSearch}
        style={styles.searchbar}
      />
      {isLoading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={styles.empty}>車両が見つかりません</Text>
          }
        />
      )}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push("/vehicles/new")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  searchbar: { margin: 12, backgroundColor: "#ffffff" },
  list: { padding: 12, paddingBottom: 80 },
  card: { marginBottom: 8, backgroundColor: "#ffffff" },
  title: { fontWeight: "700", color: "#1a1a2e" },
  sub: { color: "#71717a", marginTop: 2 },
  owner: { color: "#3b82f6", marginTop: 4 },
  loading: { marginTop: 32 },
  empty: { textAlign: "center", color: "#71717a", marginTop: 32 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    backgroundColor: "#1a1a2e",
  },
});
