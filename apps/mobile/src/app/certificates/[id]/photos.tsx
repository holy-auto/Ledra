import { useState } from "react";
import { View, StyleSheet, FlatList, Image, Alert } from "react-native";
import {
  Text,
  ActivityIndicator,
  Snackbar,
  IconButton,
} from "react-native-paper";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { mobileApi, mobileMultipart } from "@/lib/api";
import { STAGE_OPTIONS, type CertificatePhotoStage } from "@/lib/photoStage";
import { appendImage, pickImageFromCamera, type PickedImage } from "@/lib/pickImage";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface NonceResponse {
  capture_nonce: string | null;
  public_id: string | null;
}

const STAGE_SEGMENTS = STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

export default function CertificatePhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Exclude<CertificatePhotoStage, "unspecified">>("in_progress");
  const [staged, setStaged] = useState<PickedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  // 証明書の public_id（アップロードに必須）と既存枚数を取得。
  const { data: cert, isLoading } = useQuery({
    queryKey: ["certificate-photo-meta", id],
    queryFn: async () => {
      const [{ data: row, error: rowErr }, { count, error: cntErr }] = await Promise.all([
        supabase.from("certificates").select("public_id").eq("id", id).single(),
        supabase
          .from("certificate_images")
          .select("id", { count: "exact", head: true })
          .eq("certificate_id", id),
      ]);
      if (rowErr) throw rowErr;
      if (cntErr) throw cntErr;
      return { publicId: (row?.public_id as string | null) ?? null, uploadedCount: count ?? 0 };
    },
    enabled: !!id,
  });
  const publicId = cert?.publicId ?? null;
  const uploadedCount = cert?.uploadedCount ?? 0;

  async function takePhoto() {
    // カメラ限定（ライブラリ選択は不可）。その場で撮った新鮮な写真だけを受け付ける。
    const result = await pickImageFromCamera();
    if (!result.ok) {
      if (!result.cancelled) Alert.alert("撮影できません", result.message);
      return;
    }
    setStaged((prev) => [...prev, result.image]);
  }

  function removeStaged(uri: string) {
    setStaged((prev) => prev.filter((p) => p.uri !== uri));
  }

  async function upload() {
    if (staged.length === 0) return;
    if (!publicId) {
      setSnackbar("証明書の公開IDを取得できませんでした。通信状態を確認してください。");
      return;
    }
    setUploading(true);
    try {
      // 1撮影セッション = 1nonce。全写真を単一の multipart リクエストで送る
      // （サーバは nonce をリクエストにつき1回だけ消費するため、必ずまとめて送る）。
      // nonce 取得は best-effort（失敗しても public_id さえあれば basic ティアで続行）。
      const nonce = await mobileApi<NonceResponse>(`/certificates/${id}/capture-nonce`, {
        method: "POST",
      }).catch(() => ({ capture_nonce: null, public_id: null }) as NonceResponse);

      const form = new FormData();
      for (const p of staged) {
        appendImage(form, "photos", p);
      }
      form.append("stage", stage);
      form.append("public_id", publicId);
      if (nonce.capture_nonce) form.append("capture_nonce", nonce.capture_nonce);

      const res = await mobileMultipart<{ uploaded: number }>("/certificates/images/upload", form);

      setStaged([]);
      await queryClient.invalidateQueries({ queryKey: ["certificate-photo-meta", id] });
      await queryClient.invalidateQueries({ queryKey: ["certificate-images", id] });
      // 作業詳細のサムネイル（["work-photos", certId]）も同じ certificate_id を見るため更新する。
      await queryClient.invalidateQueries({ queryKey: ["work-photos", id] });
      setSnackbar(`${res?.uploaded ?? staged.length}枚をアップロードしました`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "アップロードに失敗しました";
      setSnackbar(msg);
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "施工写真" }} />
      <View style={styles.container}>
        <View style={styles.stageBox}>
          <Text style={styles.stageLabel}>撮影段階</Text>
          <SegmentedControl
            segments={STAGE_SEGMENTS}
            value={stage}
            onChange={(v) => setStage(v as Exclude<CertificatePhotoStage, "unspecified">)}
          />
        </View>

        <FlatList
          data={staged}
          keyExtractor={(item) => item.uri}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={styles.thumbBox}>
              <Image source={{ uri: item.uri }} style={styles.thumb} />
              <IconButton
                icon="close-circle"
                size={20}
                iconColor={colors.danger}
                style={styles.removeBtn}
                onPress={() => removeStaged(item.uri)}
              />
            </View>
          )}
          ListHeaderComponent={
            <View style={styles.infoCard}>
              <Text style={styles.infoText}>
                アップロード済み: {uploadedCount}枚 / 撮影待ち: {staged.length}枚
              </Text>
              <Text style={styles.hint}>
                写真はカメラ撮影のみ・端末には保存されずDBに直接保存されます。
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyCenter}>
              <Text style={styles.emptyText}>
                「撮影」で施工写真を追加してください
              </Text>
            </View>
          }
        />

        <View style={styles.footer}>
          <LedraButton
            variant="outline"
            icon="camera"
            onPress={takePhoto}
            disabled={uploading}
            style={styles.actionButton}
            fullWidth={false}
          >
            撮影
          </LedraButton>
          <LedraButton
            icon="cloud-upload"
            onPress={upload}
            loading={uploading}
            disabled={uploading || staged.length === 0}
            style={styles.actionButton}
            fullWidth={false}
          >
            アップロード ({staged.length})
          </LedraButton>
        </View>
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 64 },
  stageBox: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stageLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  grid: { padding: spacing.xs },
  infoCard: {
    margin: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  infoText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  hint: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  thumbBox: { flex: 1 / 3, aspectRatio: 1, padding: spacing.xs },
  thumb: { flex: 1, borderRadius: radius.sm, backgroundColor: colors.border },
  removeBtn: { position: "absolute", top: -8, right: -8, margin: 0 },
  emptyCenter: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 64 },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionButton: { flex: 1 },
});
