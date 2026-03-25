import { useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { Text, Card, Chip, ActivityIndicator } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
  certificate_id: string | null;
  vehicle_id: string | null;
  certificate_no: string | null;
  plate_display: string | null;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  prepared: { bg: "#f3f4f6", text: "#374151" },
  written: { bg: "#dbeafe", text: "#1e40af" },
  attached: { bg: "#dcfce7", text: "#166534" },
  lost: { bg: "#fee2e2", text: "#991b1b" },
  retired: { bg: "#f3f4f6", text: "#71717a" },
  error: { bg: "#fee2e2", text: "#991b1b" },
};

export default function NfcTagsScreen() {
  const { user } = useAuthStore();

  const { data: tags, isLoading, refetch } = useQuery({
    queryKey: ["nfc-tags", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select(
          "id, tag_code, uid, status, certificate_id, vehicle_id, certificates(certificate_no), vehicles(plate_display)"
        )
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      return (data as unknown[]).map((row: any) => ({
        id: row.id,
        tag_code: row.tag_code,
        uid: row.uid,
        status: row.status,
        certificate_id: row.certificate_id,
        vehicle_id: row.vehicle_id,
        certificate_no: row.certificates?.certificate_no ?? null,
        plate_display: row.vehicles?.plate_display ?? null,
      })) as NfcTag[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: NfcTag }) => {
      const statusStyle = STATUS_STYLES[item.status] ?? {
        bg: "#f3f4f6",
        text: "#374151",
      };

      return (
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={styles.tagCode}>
                  {item.tag_code}
                </Text>
                {item.uid && (
                  <Text variant="bodySmall" style={styles.sub}>
                    UID: {item.uid}
                  </Text>
                )}
              </View>
              <Chip
                compact
                style={{ backgroundColor: statusStyle.bg }}
                textStyle={{ color: statusStyle.text, fontSize: 11 }}
              >
                {item.status}
              </Chip>
            </View>

            {(item.certificate_no || item.plate_display) && (
              <View style={styles.linkedInfo}>
                {item.certificate_no && (
                  <Text variant="bodySmall" style={styles.linked}>
                    証明書: {item.certificate_no}
                  </Text>
                )}
                {item.plate_display && (
                  <Text variant="bodySmall" style={styles.linked}>
                    車両: {item.plate_display}
                  </Text>
                )}
              </View>
            )}
          </Card.Content>
        </Card>
      );
    },
    []
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={styles.empty}>NFCタグはありません</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  list: { padding: 12 },
  card: { marginBottom: 8, backgroundColor: "#ffffff" },
  row: { flexDirection: "row", alignItems: "center" },
  tagCode: { fontWeight: "700", color: "#1a1a2e" },
  sub: { color: "#71717a", marginTop: 2 },
  linkedInfo: { marginTop: 8, borderTopWidth: 1, borderTopColor: "#e4e4e7", paddingTop: 8 },
  linked: { color: "#3b82f6", marginTop: 2 },
  loading: { marginTop: 32 },
  empty: { textAlign: "center", color: "#71717a", marginTop: 32 },
});
