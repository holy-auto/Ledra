import { View, ScrollView, StyleSheet } from "react-native";
import {
  Text,
  Card,
  Chip,
  Divider,
  ActivityIndicator,
} from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

interface VehicleDetail {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

interface Certificate {
  id: string;
  certificate_no: string;
  status: string;
  issued_date: string | null;
  service_type: string | null;
}

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
}

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, maker, model, year, plate_display, customer_id, customer_name"
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as VehicleDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: certificates } = useQuery({
    queryKey: ["vehicle-certificates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("id, certificate_no, status, issued_date, service_type")
        .eq("vehicle_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: nfcTags } = useQuery({
    queryKey: ["vehicle-nfc-tags", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select("id, tag_code, uid, status")
        .eq("vehicle_id", id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data as NfcTag[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  if (isLoading || !vehicle) {
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
            {vehicle.maker} {vehicle.model}
          </Text>
          <Text variant="bodyMedium" style={styles.plate}>
            {vehicle.plate_display}
          </Text>
          {vehicle.year && (
            <Text variant="bodySmall" style={styles.sub}>
              年式: {vehicle.year}
            </Text>
          )}

          <Divider style={styles.divider} />

          {vehicle.customer_name && (
            <View style={styles.ownerRow}>
              <Text variant="labelMedium" style={styles.label}>
                オーナー
              </Text>
              <Text
                variant="bodyMedium"
                style={styles.link}
                onPress={() =>
                  vehicle.customer_id &&
                  router.push(`/customers/${vehicle.customer_id}`)
                }
              >
                {vehicle.customer_name}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* NFC Tags */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          NFCタグ
        </Text>
        {nfcTags && nfcTags.length > 0 ? (
          nfcTags.map((tag) => (
            <Card key={tag.id} style={styles.listCard} mode="outlined">
              <Card.Content style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{tag.tag_code}</Text>
                  {tag.uid && (
                    <Text variant="bodySmall" style={styles.sub}>
                      UID: {tag.uid}
                    </Text>
                  )}
                </View>
                <NfcStatusBadge status={tag.status} />
              </Card.Content>
            </Card>
          ))
        ) : (
          <Text style={styles.empty}>NFCタグはありません</Text>
        )}
      </View>

      {/* Certificate History */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          証明書履歴
        </Text>
        {certificates && certificates.length > 0 ? (
          certificates.map((cert) => (
            <Card
              key={cert.id}
              style={styles.listCard}
              mode="outlined"
              onPress={() => router.push(`/certificates/${cert.id}`)}
            >
              <Card.Content style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={styles.certNo}>
                    {cert.certificate_no}
                  </Text>
                  <Text variant="bodySmall" style={styles.sub}>
                    {cert.service_type} {cert.issued_date ?? ""}
                  </Text>
                </View>
                <StatusBadge status={cert.status} />
              </Card.Content>
            </Card>
          ))
        ) : (
          <Text style={styles.empty}>証明書はありません</Text>
        )}
      </View>
    </ScrollView>
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

function NfcStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    prepared: { bg: "#f3f4f6", text: "#374151" },
    written: { bg: "#dbeafe", text: "#1e40af" },
    attached: { bg: "#dcfce7", text: "#166534" },
    lost: { bg: "#fee2e2", text: "#991b1b" },
    retired: { bg: "#f3f4f6", text: "#71717a" },
    error: { bg: "#fee2e2", text: "#991b1b" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#374151" };
  return (
    <Chip compact style={{ backgroundColor: s.bg }} textStyle={{ color: s.text, fontSize: 11 }}>
      {status}
    </Chip>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { margin: 12, backgroundColor: "#ffffff" },
  heading: { fontWeight: "700", color: "#1a1a2e" },
  plate: { color: "#3f3f46", marginTop: 4, fontSize: 16 },
  sub: { color: "#71717a", marginTop: 2 },
  divider: { marginVertical: 12 },
  label: { color: "#71717a", marginBottom: 2 },
  link: { color: "#3b82f6" },
  ownerRow: { marginBottom: 8 },
  section: { padding: 12 },
  sectionTitle: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  listCard: { marginBottom: 8, backgroundColor: "#ffffff" },
  row: { flexDirection: "row", alignItems: "center" },
  certNo: { fontWeight: "600", color: "#1a1a2e" },
  empty: { color: "#71717a", textAlign: "center", marginTop: 16 },
});
