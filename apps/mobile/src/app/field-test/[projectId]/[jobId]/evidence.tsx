import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Image } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { mobileApi, mobileMultipart } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type EvidenceItem = {
  id: string;
  evidence_type: string;
  file_name: string | null;
  caption: string | null;
  content_type: string | null;
  signed_url: string | null;
  created_at: string;
};
type JobDetail = { evidence: EvidenceItem[] };

const isImageType = (ct: string | null) =>
  !!ct && ct.startsWith("image/");

const EVT_JA: Record<string, string> = {
  photo_before: "施工前", photo_during: "施工中", photo_after: "施工後",
  measurement: "計測", env_data: "環境", video: "動画", document: "書類", other: "その他",
};
const EVIDENCE_TYPES = Object.keys(EVT_JA);

export default function EvidenceUploadScreen() {
  const { jobId } = useLocalSearchParams<{ projectId: string; jobId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const qk = ["ft-job-detail", user?.tenantId, jobId];
  const { data: job, isLoading, refetch } = useQuery({
    queryKey: qk,
    queryFn: () => mobileApi<JobDetail>(`/field-test/jobs/${jobId}`),
    enabled: !!user?.tenantId && !!jobId,
  });

  const [uploading, setUploading] = useState(false);
  const [selectedType, setSelectedType] = useState(EVIDENCE_TYPES[0]);

  const pickAndUpload = useCallback(async (source: "camera" | "library") => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      quality: 0.8,
      allowsMultipleSelection: false,
    };

    const result = source === "camera"
      ? await ImagePicker.launchCameraAsync(opts)
      : await ImagePicker.launchImageLibraryAsync(opts);

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? `evidence_${Date.now()}.jpg`,
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);
      form.append("job_id", jobId);
      form.append("evidence_type", selectedType);

      await mobileMultipart("/field-test/evidence", form);
      queryClient.invalidateQueries({ queryKey: qk });
    } catch (e: unknown) {
      Alert.alert("エラー", e instanceof Error ? e.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
    }
  }, [jobId, selectedType, qk, queryClient]);

  const evidence = job?.evidence ?? [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
    >
      {/* Upload Section */}
      <View style={styles.uploadCard}>
        <Text style={styles.uploadTitle}>証拠をアップロード</Text>

        {/* Evidence Type Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
          <View style={styles.typeRow}>
            {EVIDENCE_TYPES.map((t) => (
              <Button
                key={t}
                mode={selectedType === t ? "contained" : "outlined"}
                onPress={() => setSelectedType(t)}
                compact
                style={styles.typeBtn}
                labelStyle={styles.typeBtnLabel}
              >
                {EVT_JA[t]}
              </Button>
            ))}
          </View>
        </ScrollView>

        {/* Camera / Library Buttons */}
        <View style={styles.actionRow}>
          <Button
            mode="contained"
            icon="camera"
            onPress={() => pickAndUpload("camera")}
            loading={uploading}
            disabled={uploading}
            style={styles.actionBtn}
          >
            撮影
          </Button>
          <Button
            mode="outlined"
            icon="image"
            onPress={() => pickAndUpload("library")}
            loading={uploading}
            disabled={uploading}
            style={styles.actionBtn}
          >
            ライブラリ
          </Button>
        </View>
      </View>

      {/* Evidence List */}
      <Text style={styles.sectionTitle}>アップロード済み ({evidence.length})</Text>
      {evidence.length === 0 ? (
        <View style={styles.empty}>
          <Icon source="camera-off-outline" size={40} color={colors.textTertiary} />
          <Text style={styles.emptyText}>証拠データはまだありません</Text>
        </View>
      ) : (
        evidence.map((ev) => (
          <View key={ev.id} style={styles.evidenceItem}>
            {isImageType(ev.content_type) && ev.signed_url ? (
              <Image source={{ uri: ev.signed_url }} style={styles.evThumb} accessibilityLabel={ev.file_name ?? "証拠画像"} />
            ) : (
              <View style={styles.evBadge}>
                <Text style={styles.evBadgeText}>{EVT_JA[ev.evidence_type] ?? ev.evidence_type}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.evName} numberOfLines={1}>{ev.file_name ?? "ファイル"}</Text>
              {ev.caption && <Text style={styles.evCaption} numberOfLines={1}>{ev.caption}</Text>}
              <Text style={styles.evMeta}>
                {EVT_JA[ev.evidence_type] ?? ev.evidence_type} · {ev.created_at?.slice(0, 10)}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  uploadCard: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.lg, ...shadows.card, marginBottom: spacing.lg,
  },
  uploadTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.md },
  typeScroll: { marginBottom: spacing.md },
  typeRow: { flexDirection: "row", gap: spacing.xs },
  typeBtn: { borderRadius: radius.md },
  typeBtnLabel: { fontSize: 11 },
  actionRow: { flexDirection: "row", gap: spacing.sm },
  actionBtn: { flex: 1, borderRadius: radius.md },
  sectionTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.sm },
  empty: { alignItems: "center", paddingVertical: 40, gap: spacing.sm },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary },
  evidenceItem: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceVariant, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.xs,
  },
  evBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  evBadgeText: { ...typography.meta, color: colors.primary, fontSize: 10 },
  evThumb: { width: 56, height: 56, borderRadius: radius.sm },
  evName: { ...typography.bodySmall, color: colors.textPrimary },
  evCaption: { ...typography.meta, color: colors.textSecondary },
  evMeta: { ...typography.meta, color: colors.textTertiary, marginTop: 2 },
  evDate: { ...typography.meta, color: colors.textTertiary },
});
