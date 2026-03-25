import { useState } from "react";
import { View, ScrollView, StyleSheet, Image } from "react-native";
import {
  Text,
  Card,
  Button,
  Chip,
  Divider,
  ActivityIndicator,
  Dialog,
  Portal,
  TextInput,
} from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface CertificateDetail {
  id: string;
  certificate_no: string;
  public_id: string | null;
  status: string;
  service_type: string | null;
  content: Record<string, unknown> | null;
  customer_name: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  plate_display: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  images: string[] | null;
}

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
}

export default function CertificateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [voidDialogVisible, setVoidDialogVisible] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const { data: cert, isLoading } = useQuery({
    queryKey: ["certificate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          "id, certificate_no, public_id, status, service_type, content, customer_name, customer_id, vehicle_id, vehicle_maker, vehicle_model, plate_display, issued_date, expiry_date, images"
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as CertificateDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: nfcTags } = useQuery({
    queryKey: ["certificate-nfc-tags", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select("id, tag_code, uid, status")
        .eq("certificate_id", id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data as NfcTag[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  const activateMutation = useMutation({
    mutationFn: () =>
      mobileApi(`/certificates/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificate", id] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      mobileApi(`/certificates/${id}/void`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      setVoidDialogVisible(false);
      setVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["certificate", id] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  if (isLoading || !cert) {
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
          <View style={styles.headerRow}>
            <Text variant="headlineSmall" style={styles.heading}>
              {cert.certificate_no}
            </Text>
            <StatusBadge status={cert.status} />
          </View>

          <Divider style={styles.divider} />

          <InfoRow label="サービス" value={cert.service_type} />
          <InfoRow label="顧客" value={cert.customer_name} />
          <InfoRow
            label="車両"
            value={
              [cert.vehicle_maker, cert.vehicle_model, cert.plate_display]
                .filter(Boolean)
                .join(" ") || null
            }
          />
          <InfoRow label="発行日" value={cert.issued_date} />
          <InfoRow label="有効期限" value={cert.expiry_date} />
        </Card.Content>
      </Card>

      {/* Images */}
      {cert.images && cert.images.length > 0 && (
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            画像
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {cert.images.map((url, i) => (
              <Image
                key={i}
                source={{ uri: url }}
                style={styles.image}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* NFC Tags */}
      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          NFCタグ
        </Text>
        {nfcTags && nfcTags.length > 0 ? (
          nfcTags.map((tag) => (
            <Card key={tag.id} style={styles.tagCard} mode="outlined">
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

      {/* Actions */}
      <View style={styles.actions}>
        {cert.status === "draft" && (
          <Button
            mode="contained"
            buttonColor="#166534"
            onPress={() => activateMutation.mutate()}
            loading={activateMutation.isPending}
            disabled={activateMutation.isPending}
            style={styles.actionButton}
          >
            有効化
          </Button>
        )}

        {cert.status === "active" && (
          <Button
            mode="contained"
            buttonColor="#991b1b"
            onPress={() => setVoidDialogVisible(true)}
            style={styles.actionButton}
          >
            無効化
          </Button>
        )}

        <Button
          mode="contained"
          buttonColor="#1a1a2e"
          icon="nfc"
          onPress={() => router.push(`/nfc/write/${cert.id}`)}
          style={styles.actionButton}
        >
          NFC書込
        </Button>
      </View>

      {/* Void Dialog */}
      <Portal>
        <Dialog
          visible={voidDialogVisible}
          onDismiss={() => setVoidDialogVisible(false)}
        >
          <Dialog.Title>証明書を無効化</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="無効化理由"
              value={voidReason}
              onChangeText={setVoidReason}
              mode="outlined"
              multiline
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVoidDialogVisible(false)}>
              キャンセル
            </Button>
            <Button
              onPress={() => voidMutation.mutate(voidReason)}
              loading={voidMutation.isPending}
              disabled={!voidReason.trim() || voidMutation.isPending}
              textColor="#991b1b"
            >
              無効化
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {(activateMutation.isError || voidMutation.isError) && (
        <Text style={styles.error}>
          {activateMutation.error?.message ?? voidMutation.error?.message}
        </Text>
      )}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: "#dcfce7", text: "#166534", label: "有効" },
    draft: { bg: "#f3f4f6", text: "#374151", label: "下書き" },
    void: { bg: "#fee2e2", text: "#991b1b", label: "無効" },
    expired: { bg: "#fef3c7", text: "#92400e", label: "期限切" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", text: "#374151", label: status };
  return (
    <Chip compact style={{ backgroundColor: s.bg }} textStyle={{ color: s.text, fontSize: 12 }}>
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heading: { fontWeight: "700", color: "#1a1a2e" },
  divider: { marginVertical: 12 },
  infoRow: { marginBottom: 8 },
  label: { color: "#71717a", marginBottom: 2 },
  section: { padding: 12 },
  sectionTitle: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  image: { width: 120, height: 120, borderRadius: 8, marginRight: 8 },
  tagCard: { marginBottom: 8, backgroundColor: "#ffffff" },
  row: { flexDirection: "row", alignItems: "center" },
  sub: { color: "#71717a", marginTop: 2 },
  empty: { color: "#71717a", textAlign: "center", marginTop: 8 },
  actions: { padding: 12, gap: 8, marginBottom: 32 },
  actionButton: { marginBottom: 0 },
  error: { color: "#991b1b", textAlign: "center", padding: 12 },
});
