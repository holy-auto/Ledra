import { View, ScrollView, StyleSheet } from "react-native";
import { Text, Card, Button, Divider, ActivityIndicator, Chip } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface Customer {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
}

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  year: number | null;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, name_kana, email, phone, postal_code, address, note")
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: vehicles } = useQuery({
    queryKey: ["customer-vehicles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate_display, maker, model, year")
        .eq("customer_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vehicle[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  if (isLoading || !customer) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="headlineSmall" style={styles.heading}>
            {customer.name}
          </Text>
          {customer.name_kana && (
            <Text variant="bodyMedium" style={styles.kana}>
              {customer.name_kana}
            </Text>
          )}

          <Divider style={styles.divider} />

          <InfoRow label="メール" value={customer.email} />
          <InfoRow label="電話" value={customer.phone} />
          <InfoRow label="郵便番号" value={customer.postal_code} />
          <InfoRow label="住所" value={customer.address} />
          {customer.note && (
            <>
              <Text variant="labelMedium" style={styles.label}>
                メモ
              </Text>
              <Text variant="bodyMedium" style={styles.note}>
                {customer.note}
              </Text>
            </>
          )}
        </Card.Content>
      </Card>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          登録車両
        </Text>
        {vehicles && vehicles.length > 0 ? (
          vehicles.map((v) => (
            <Card
              key={v.id}
              style={styles.vehicleCard}
              mode="outlined"
              onPress={() => router.push(`/vehicles/${v.id}`)}
            >
              <Card.Content style={styles.vehicleRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={styles.vehicleTitle}>
                    {v.maker} {v.model}
                  </Text>
                  <Text variant="bodySmall" style={styles.sub}>
                    {v.plate_display} {v.year ? `(${v.year})` : ""}
                  </Text>
                </View>
                <Chip compact>詳細</Chip>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Text style={styles.empty}>登録車両はありません</Text>
        )}
      </View>

      <Button
        mode="contained"
        style={styles.editButton}
        buttonColor="#1a1a2e"
        onPress={() => {
          // TODO: navigate to edit screen
        }}
      >
        編集
      </Button>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text variant="labelMedium" style={styles.label}>
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { margin: 12, backgroundColor: "#ffffff" },
  heading: { fontWeight: "700", color: "#1a1a2e" },
  kana: { color: "#71717a", marginTop: 2 },
  divider: { marginVertical: 12 },
  infoRow: { marginBottom: 8 },
  label: { color: "#71717a", marginBottom: 2 },
  note: { color: "#3f3f46", backgroundColor: "#f4f4f5", padding: 8, borderRadius: 4 },
  section: { padding: 12 },
  sectionTitle: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  vehicleCard: { marginBottom: 8, backgroundColor: "#ffffff" },
  vehicleRow: { flexDirection: "row", alignItems: "center" },
  vehicleTitle: { fontWeight: "600", color: "#1a1a2e" },
  sub: { color: "#71717a", marginTop: 2 },
  empty: { color: "#71717a", textAlign: "center", marginTop: 16 },
  editButton: { margin: 12, marginBottom: 32 },
});
