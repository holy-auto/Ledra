import { useState } from "react";
import { View, ScrollView, StyleSheet, Image, Alert } from "react-native";
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
  IconButton,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library";
import { File, Paths } from "expo-file-system";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

/** 正規 certificate_images 行（表示・DL用）。 */
interface CertImage {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  medium_path: string | null;
  stage: string | null;
  authenticity_grade: string | null;
}

/** assets バケット（public）内のパスから表示/DL用の公開URLを作る。 */
function assetUrl(path: string): string {
  return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
}

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
  const [snackbar, setSnackbar] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: cert, isLoading } = useQuery({
    queryKey: ["certificate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          "id, certificate_no, public_id, status, service_type, content, customer_name, customer_id, vehicle_id, vehicle_maker, vehicle_model, plate_display, issued_date, expiry_date"
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as CertificateDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  // 施工写真は正規テーブル (certificate_images) を certificate_id で読む。
  // storage_path から assets(public) の公開URLを導出して表示・DLする。
  const { data: images = [] } = useQuery({
    queryKey: ["certificate-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_images")
        .select("id, storage_path, thumbnail_path, medium_path, stage, authenticity_grade")
        .eq("certificate_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CertImage[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  // 「端末に保存」: 撮影時は端末に残さないが、後から明示操作でギャラリーへ保存できる。
  async function saveToDevice(img: CertImage) {
    setSavingId(img.id);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert("権限エラー", "写真を端末に保存する権限を許可してください");
        return;
      }
      const url = assetUrl(img.storage_path);
      const ext = img.storage_path.split(".").pop()?.split("?")[0] ?? "jpg";
      // キャッシュに一時DL → ギャラリー保存 → 一時ファイル削除。端末に残すのはギャラリーのみ。
      const dest = new File(Paths.cache, `cert-${img.id}.${ext}`);
      const dl = await File.downloadFileAsync(url, dest, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      dl.delete();
      setSnackbar("端末に保存しました");
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  }

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
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            施工写真 ({images.length})
          </Text>
          <Button
            mode="text"
            icon="camera"
            compact
            onPress={() => router.push(`/certificates/${cert.id}/photos`)}
            textColor="#1a1a2e"
          >
            撮影
          </Button>
        </View>
        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {images.map((img) => (
              <View key={img.id} style={styles.imageCard}>
                <Image
                  source={{ uri: assetUrl(img.thumbnail_path ?? img.storage_path) }}
                  style={styles.image}
                  resizeMode="cover"
                  accessibilityLabel={`証明書画像 (${img.stage ?? "未指定"})`}
                />
                <View style={styles.imageMeta}>
                  {img.stage && <StageBadge stage={img.stage} />}
                  {img.authenticity_grade && <GradeBadge grade={img.authenticity_grade} />}
                </View>
                <IconButton
                  icon="download"
                  size={18}
                  mode="contained-tonal"
                  loading={savingId === img.id}
                  disabled={savingId === img.id}
                  onPress={() => saveToDevice(img)}
                  style={styles.saveBtn}
                  accessibilityLabel="端末に保存"
                />
              </View>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.empty}>施工写真はありません</Text>
        )}
      </View>

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

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={3000}>
        {snackbar}
      </Snackbar>
    </ScrollView>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    intake_before: { bg: "#dbeafe", text: "#1e40af", label: "施工前" },
    in_progress: { bg: "#fef3c7", text: "#92400e", label: "作業中" },
    after: { bg: "#dcfce7", text: "#166534", label: "施工後" },
    unspecified: { bg: "#f3f4f6", text: "#71717a", label: "未指定" },
  };
  const s = map[stage] ?? map.unspecified;
  return (
    <Chip compact style={{ backgroundColor: s.bg }} textStyle={{ color: s.text, fontSize: 10 }}>
      {s.label}
    </Chip>
  );
}

function GradeBadge({ grade }: { grade: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    verified: { bg: "#dcfce7", text: "#166534", label: "担保" },
    sealed: { bg: "#dbeafe", text: "#1e40af", label: "封印" },
    basic: { bg: "#f3f4f6", text: "#71717a", label: "基本" },
    unverified: { bg: "#fee2e2", text: "#991b1b", label: "未検証" },
  };
  const s = map[grade] ?? { bg: "#f3f4f6", text: "#71717a", label: grade };
  return (
    <Chip compact style={{ backgroundColor: s.bg }} textStyle={{ color: s.text, fontSize: 10 }}>
      {s.label}
    </Chip>
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
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  imageCard: { marginRight: 8 },
  image: { width: 120, height: 120, borderRadius: 8 },
  imageMeta: { flexDirection: "row", gap: 4, marginTop: 4, flexWrap: "wrap", maxWidth: 120 },
  saveBtn: { position: "absolute", top: -4, right: -4, margin: 0 },
  tagCard: { marginBottom: 8, backgroundColor: "#ffffff" },
  row: { flexDirection: "row", alignItems: "center" },
  sub: { color: "#71717a", marginTop: 2 },
  empty: { color: "#71717a", textAlign: "center", marginTop: 8 },
  actions: { padding: 12, gap: 8, marginBottom: 32 },
  actionButton: { marginBottom: 0 },
  error: { color: "#991b1b", textAlign: "center", padding: 12 },
});
