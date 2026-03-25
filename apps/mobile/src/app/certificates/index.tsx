import { useState, useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Text, Card, Chip, SegmentedButtons, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

type CertStatus = "active" | "draft" | "void" | "expired";

interface Certificate {
  id: string;
  certificate_no: string;
  customer_name: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  plate_display: string | null;
  status: string;
  issued_date: string | null;
}

const STATUS_OPTIONS = [
  { value: "active", label: "有効" },
  { value: "draft", label: "下書き" },
  { value: "void", label: "無効" },
  { value: "expired", label: "期限切" },
];

export default function CertificatesIndexScreen() {
  const { user } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<CertStatus>("active");

  const { data: certificates, isLoading, refetch } = useQuery({
    queryKey: ["certificates", user?.tenantId, statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          "id, certificate_no, customer_name, vehicle_maker, vehicle_model, plate_display, status, issued_date"
        )
        .eq("tenant_id", user!.tenantId)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: Certificate }) => (
      <Card
        style={styles.card}
        mode="outlined"
        onPress={() => router.push(`/certificates/${item.id}`)}
      >
        <Card.Content>
          <View style={styles.row}>
            <Text variant="titleSmall" style={styles.certNo}>
              {item.certificate_no}
            </Text>
            <StatusBadge status={item.status} />
          </View>
          {item.customer_name && (
            <Text variant="bodyMedium" style={styles.customer}>
              {item.customer_name}
            </Text>
          )}
          <Text variant="bodySmall" style={styles.sub}>
            {[item.vehicle_maker, item.vehicle_model, item.plate_display]
              .filter(Boolean)
              .join(" ")}
          </Text>
          {item.issued_date && (
            <Text variant="bodySmall" style={styles.sub}>
              発行日: {item.issued_date}
            </Text>
          )}
        </Card.Content>
      </Card>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v as CertStatus)}
        buttons={STATUS_OPTIONS}
        style={styles.filter}
      />
      {isLoading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={certificates}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={styles.empty}>証明書が見つかりません</Text>
          }
        />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "#dcfce7", text: "#166534", label: "有効" },
    draft: { bg: "#f3f4f6", text: "#374151", label: "下書き" },
    void: { bg: "#fee2e2", text: "#991b1b", label: "無効" },
    expired: { bg: "#fef3c7", text: "#92400e", label: "期限切" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#374151", label: status };
  return (
    <Chip compact style={{ backgroundColor: s.bg }} textStyle={{ color: s.text, fontSize: 11 }}>
      {s.label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  filter: { margin: 12 },
  list: { padding: 12, paddingBottom: 24 },
  card: { marginBottom: 8, backgroundColor: "#ffffff" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  certNo: { fontWeight: "700", color: "#1a1a2e" },
  customer: { marginTop: 4, color: "#3f3f46" },
  sub: { color: "#71717a", marginTop: 2 },
  loading: { marginTop: 32 },
  empty: { textAlign: "center", color: "#71717a", marginTop: 32 },
});
