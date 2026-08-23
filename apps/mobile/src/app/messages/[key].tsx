import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { Text, Icon, Snackbar } from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { mobileApi, mobileMultipart } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, sizing, shadows } from "@/constants/tokens";

/**
 * 1 スレッドの会話。テキストと画像を返信できる。
 *
 * 画像は LINE の仕様で JPEG / PNG・10MB まで。iPhone のライブラリは HEIC を返すので
 * preferredAssetRepresentationMode: "compatible" で JPEG へ変換させる。
 * それでも通らない形式は、無駄なアップロードをせずここで止める（サーバ側も同じ検証をする）。
 */

/** LINE の受け付ける画像。sendImage.ts と同じ値を持つ */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

interface PendingImage {
  uri: string;
  name: string;
  type: string;
}

/** 拡張子から MIME を推測する。ピッカーが mimeType を返さない場合の保険 */
function guessImageType(uri: string): string {
  const ext = (uri.split(".").pop()?.split("?")[0] ?? "jpg").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "heic" || ext === "heif") return "image/heic";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
  delivered_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  attachment_url?: string | null;
  attachment_content_type?: string | null;
}

interface ThreadResponse {
  thread: {
    key: string;
    customer_id: string | null;
    line_user_id: string | null;
    email_from: string | null;
    name: string | null;
  };
  messages: Message[];
  can_send: boolean;
}

export default function MessageThreadScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const queryClient = useQueryClient();
  const listRef = useRef<FlatList<Message>>(null);
  const [draft, setDraft] = useState("");
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [snackbar, setSnackbar] = useState("");
  const markedRef = useRef(false);

  const encodedKey = encodeURIComponent(key ?? "");

  const { data, isLoading } = useQuery({
    queryKey: ["message-thread", key],
    queryFn: () => mobileApi<ThreadResponse>(`/messages/${encodedKey}`),
    enabled: !!key,
    // ponytail: 上限。この API は毎回スレッド全体（最大500件×3クエリ）と
    // 添付の署名付き URL を作り直して返すので、短い間隔だと通信量が嵩む。
    // 管理画面は 15 秒だが、現場は従量回線なので 30 秒にしている。
    // 詰めるなら since/カーソルを足して差分だけ返すこと
    refetchInterval: 30_000,
  });

  // 開いた時点で一度だけ既読にする。ポーリングのたびに叩かない
  useEffect(() => {
    if (!key || markedRef.current || !data) return;
    markedRef.current = true;
    mobileApi(`/messages/${encodedKey}`, { method: "PATCH" })
      .then(() => {
        // 一覧の未読バッジと、全画面に出ている通知ベルを更新する
        queryClient.invalidateQueries({ queryKey: ["message-threads"] });
      })
      .catch(() => {
        // 既読化の失敗は操作を止めるほどではない
      });
  }, [key, encodedKey, data, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      mobileApi<{ delivered: boolean }>(`/messages/${encodedKey}`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: (res) => {
      setDraft("");
      queryClient.invalidateQueries({ queryKey: ["message-thread", key] });
      queryClient.invalidateQueries({ queryKey: ["message-threads"] });
      // 送信できなくても履歴には残る。黙って成功に見せない
      if (!res.delivered) setSnackbar("送信できませんでした。LINE の設定を確認してください。");
    },
    onError: (e) => setSnackbar(e instanceof Error ? e.message : "送信に失敗しました"),
  });

  const sendImageMutation = useMutation({
    mutationFn: (image: PendingImage) => {
      const form = new FormData();
      // React Native の FormData ファイル形式
      form.append("image", { uri: image.uri, name: image.name, type: image.type } as unknown as Blob);
      return mobileMultipart<{ delivered: boolean }>(`/messages/${encodedKey}`, form);
    },
    onSuccess: (res) => {
      setPendingImage(null);
      queryClient.invalidateQueries({ queryKey: ["message-thread", key] });
      queryClient.invalidateQueries({ queryKey: ["message-threads"] });
      if (!res.delivered) setSnackbar("送信できませんでした。LINE の設定を確認してください。");
    },
    onError: (e) => setSnackbar(e instanceof Error ? e.message : "画像の送信に失敗しました"),
  });

  const busy = sendMutation.isPending || sendImageMutation.isPending;

  /** ピッカーの結果を検証して控えに置く。送信は本人が押したときだけ */
  function stagePicked(asset: ImagePicker.ImagePickerAsset) {
    const type = asset.mimeType ?? guessImageType(asset.uri);
    if (!ALLOWED_IMAGE_TYPES.includes(type)) {
      setSnackbar("送れるのは JPEG と PNG だけです（LINE の仕様）。");
      return;
    }
    // fileSize は端末によって取れないことがある。取れたときだけ弾く
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      setSnackbar("画像は 10MB 以下にしてください。");
      return;
    }
    setPendingImage({
      uri: asset.uri,
      name: asset.fileName ?? `photo.${type === "image/png" ? "png" : "jpg"}`,
      type,
    });
  }

  async function pickFromCamera() {
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
    if (!result.canceled && result.assets?.[0]) stagePicked(result.assets[0]);
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("権限エラー", "写真へのアクセスを許可してください");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
      // iOS のライブラリは既定で HEIC を返す。LINE は受け付けないので変換させる
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!result.canceled && result.assets?.[0]) stagePicked(result.assets[0]);
  }

  function chooseImageSource() {
    Alert.alert("画像を送る", "送信する画像を選んでください", [
      { text: "カメラで撮影", onPress: pickFromCamera },
      { text: "ライブラリから選ぶ", onPress: pickFromLibrary },
      { text: "キャンセル", style: "cancel" },
    ]);
  }

  const onSend = useCallback(() => {
    if (busy) return;
    // 画像が控えにあればそちらを先に送る（LINE の画像メッセージに本文は付かない）。
    // 文章は入力欄に残るので、続けてもう一度押せば送れる
    if (pendingImage) {
      sendImageMutation.mutate(pendingImage);
      return;
    }
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(body);
  }, [busy, pendingImage, draft, sendMutation, sendImageMutation]);

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item.direction === "outbound";
    const failed = !!item.failed_at;
    const isImage = (item.attachment_content_type ?? "").startsWith("image/");

    return (
      <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {item.attachment_url && isImage && (
            <Image
              source={{ uri: item.attachment_url }}
              style={styles.attachment}
              resizeMode="cover"
              alt="添付画像"
            />
          )}
          {item.attachment_url && !isImage && (
            <View style={styles.attachmentOther}>
              <Icon source="paperclip" size={16} color={colors.textSecondary} />
              <Text style={styles.attachmentOtherText}>添付ファイル（アプリでは表示できません）</Text>
            </View>
          )}
          {!!item.body && (
            <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
          )}
          <View style={styles.metaRow}>
            <Text style={[styles.meta, mine && styles.metaMine]}>
              {dayjs(item.created_at).format("M/D HH:mm")}
            </Text>
            {failed && (
              <Text style={styles.failed} numberOfLines={1}>
                送信失敗
              </Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const canSend = data?.can_send ?? false;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <Stack.Screen options={{ title: data?.thread.name ?? "会話" }} />

      <FlatList
        ref={listRef}
        data={data?.messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState icon="chat-outline" title="この会話にはまだメッセージがありません" />
          )
        }
      />

      {canSend ? (
        <View style={styles.composerWrap}>
          {/* 控えの画像。送る前に取り消せるようにする（相手に届いたら戻せない） */}
          {pendingImage && (
            <View style={styles.pendingRow}>
              <Image source={{ uri: pendingImage.uri }} style={styles.pendingThumb} alt="送信する画像" />
              <Text style={styles.pendingText} numberOfLines={2}>
                この画像を送ります
              </Text>
              <Pressable
                onPress={() => setPendingImage(null)}
                disabled={busy}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="画像の選択を取り消す"
              >
                <Icon source="close-circle" size={22} color={colors.textTertiary} />
              </Pressable>
            </View>
          )}

          <View style={styles.composer}>
            <Pressable
              onPress={chooseImageSource}
              disabled={busy}
              style={styles.attachButton}
              accessibilityRole="button"
              accessibilityLabel="画像を送る"
            >
              <Icon source="camera-outline" size={22} color={colors.textSecondary} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="メッセージを入力"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={onSend}
              disabled={(!draft.trim() && !pendingImage) || busy}
              style={[
                styles.sendButton,
                ((!draft.trim() && !pendingImage) || busy) && styles.sendDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={pendingImage ? "画像を送信" : "送信"}
            >
              <Icon source="send" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.cannotSend}>
          <Icon source="information-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.cannotSendText}>
            {data?.thread.email_from
              ? "メールの受信専用スレッドです。返信は管理画面から行ってください。"
              : "このスレッドにはまだ LINE ユーザーが紐付いていないため返信できません。"}
          </Text>
        </View>
      )}

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={4000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  bubbleTheirs: { backgroundColor: colors.surfaceVariant },
  bubbleMine: { backgroundColor: colors.primary },
  bubbleText: { ...typography.body, color: colors.textPrimary },
  bubbleTextMine: { color: colors.textOnPrimary },
  attachment: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  attachmentOther: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  attachmentOtherText: { ...typography.meta, color: colors.textSecondary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  meta: { ...typography.meta, color: colors.textTertiary },
  metaMine: { color: colors.primaryLight },
  failed: { ...typography.meta, color: colors.danger, fontWeight: "700" },

  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
  },
  attachButton: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  pendingThumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceVariant,
  },
  pendingText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  input: {
    flex: 1,
    minHeight: sizing.touchTarget,
    maxHeight: 120,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceVariant,
    ...typography.body,
    color: colors.textPrimary,
  },
  sendButton: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    borderRadius: sizing.touchTarget / 2,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.4 },

  cannotSend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  cannotSendText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
});
