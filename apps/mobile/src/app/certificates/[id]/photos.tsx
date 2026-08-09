import { useState } from "react";
import { View, StyleSheet, FlatList, Image, Alert } from "react-native";
import {
  Text,
  Button,
  ActivityIndicator,
  Snackbar,
  SegmentedButtons,
  IconButton,
  Card,
} from "react-native-paper";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";
import { mobileApi, mobileMultipart } from "@/lib/api";
import { STAGE_OPTIONS, type CertificatePhotoStage } from "@/lib/photoStage";

/** 撮影してまだアップロードしていないローカル写真。端末ギャラリーには保存しない一時URI。 */
interface StagedPhoto {
  uri: string;
  name: string;
  type: string;
}

interface NonceResponse {
  capture_nonce: string | null;
  public_id: string | null;
}

/** uri 拡張子から multipart 用の MIME を推定（最終判定はサーバの magic bytes）。 */
function guessType(uri: string): { ext: string; mime: string } {
  const ext = (uri.split(".").pop()?.split("?")[0] ?? "jpg").toLowerCase();
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "heic" || ext === "heif"
          ? "image/heic"
          : "image/jpeg";
  return { ext, mime };
}

export default function CertificatePhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [stage, setStage] = useState<Exclude<CertificatePhotoStage, "unspecified">>("in_progress");
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
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
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("権限エラー", "カメラへのアクセスを許可してください");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const a = result.assets[0];
    const { ext, mime } = guessType(a.uri);
    setStaged((prev) => [
      ...prev,
      { uri: a.uri, name: a.fileName ?? `capture-${prev.length + 1}.${ext}`, type: a.mimeType ?? mime },
    ]);
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
        // React Native の FormData ファイル形式。
        form.append("photos", { uri: p.uri, name: p.name, type: p.type } as unknown as Blob);
      }
      form.append("stage", stage);
      form.append("public_id", publicId);
      if (nonce.capture_nonce) form.append("capture_nonce", nonce.capture_nonce);

      const res = await mobileMultipart<{ uploaded: number }>("/certificates/images/upload", form);

      setStaged([]);
      await queryClient.invalidateQueries({ queryKey: ["certificate-photo-meta", id] });
      await queryClient.invalidateQueries({ queryKey: ["certificate-images", id] });
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
          <Text variant="labelMedium" style={styles.stageLabel}>
            撮影段階
          </Text>
          <SegmentedButtons
            value={stage}
            onValueChange={(v) => setStage(v as Exclude<CertificatePhotoStage, "unspecified">)}
            buttons={STAGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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
                iconColor="#991b1b"
                style={styles.removeBtn}
                onPress={() => removeStaged(item.uri)}
              />
            </View>
          )}
          ListHeaderComponent={
            <Card style={styles.infoCard} mode="outlined">
              <Card.Content>
                <Text variant="bodySmall" style={styles.infoText}>
                  アップロード済み: {uploadedCount}枚 / 撮影待ち: {staged.length}枚
                </Text>
                <Text variant="bodySmall" style={styles.hint}>
                  写真はカメラ撮影のみ・端末には保存されずDBに直接保存されます。
                </Text>
              </Card.Content>
            </Card>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text variant="bodyMedium" style={styles.emptyText}>
                「撮影」で施工写真を追加してください
              </Text>
            </View>
          }
        />

        <View style={styles.footer}>
          <Button
            mode="outlined"
            icon="camera"
            onPress={takePhoto}
            disabled={uploading}
            style={styles.actionButton}
            textColor="#1a1a2e"
          >
            撮影
          </Button>
          <Button
            mode="contained"
            icon="cloud-upload"
            onPress={upload}
            loading={uploading}
            disabled={uploading || staged.length === 0}
            style={styles.actionButton}
            buttonColor="#1a1a2e"
            contentStyle={{ paddingVertical: 8 }}
          >
            アップロード ({staged.length})
          </Button>
        </View>
      </View>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={3000}>
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 64 },
  stageBox: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e4e4e7",
  },
  stageLabel: { color: "#71717a", marginBottom: 8 },
  grid: { padding: 4 },
  infoCard: { margin: 8, backgroundColor: "#ffffff" },
  infoText: { color: "#1a1a2e", fontWeight: "600" },
  hint: { color: "#71717a", marginTop: 4 },
  thumbBox: { flex: 1 / 3, aspectRatio: 1, padding: 4 },
  thumb: { flex: 1, borderRadius: 8, backgroundColor: "#e4e4e7" },
  removeBtn: { position: "absolute", top: -8, right: -8, margin: 0 },
  emptyText: { color: "#71717a" },
  footer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  actionButton: { flex: 1, borderRadius: 8 },
});
