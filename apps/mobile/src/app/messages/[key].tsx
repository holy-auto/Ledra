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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { mobileApi, mobileMultipart } from "@/lib/api";
import {
  appendImage,
  pickImageFromCamera,
  pickImageFromLibrary,
  type PickedImage,
  type PickResult,
} from "@/lib/pickImage";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, sizing, shadows } from "@/constants/tokens";

/**
 * 1 スレッドの会話。テキストと画像を返信できる。
 * 画像の取得は lib/pickImage.ts（施工写真の撮影と共通）。
 */

/** LINE が受け付ける画像形式。サーバ側 src/lib/messages/sendImage.ts と同じ値 */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png"];

/**
 * アップロードの実効上限。
 *
 * LINE の仕様上は 10MB だが、その手前で **Vercel の関数リクエストボディ上限
 * (約 4.5MB)** に当たり、ハンドラに届く前に 413 が返る（JSON ですらないので
 * 画面には生のステータスしか出せない）。Web の証明書アップロードと同じ 4MB に揃える。
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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
  const [pendingImage, setPendingImage] = useState<PickedImage | null>(null);
  const [snackbar, setSnackbar] = useState("");
  const markedRef = useRef(false);
  const insets = useSafeAreaInsets();

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

  // 成否の扱いは onSend にまとめてある（画像と文章を続けて送るため）
  const sendMutation = useMutation({
    mutationFn: (body: string) =>
      mobileApi<{ delivered: boolean }>(`/messages/${encodedKey}`, {
        method: "POST",
        body: { body },
      }),
  });

  const sendImageMutation = useMutation({
    mutationFn: (image: PickedImage) => {
      const form = new FormData();
      appendImage(form, "image", image);
      return mobileMultipart<{ delivered: boolean }>(`/messages/${encodedKey}`, form);
    },
  });

  const busy = sendMutation.isPending || sendImageMutation.isPending;

  /** ピッカーの結果を検証して控えに置く。送信は本人が押したときだけ */
  function stagePicked(result: PickResult) {
    if (!result.ok) {
      if (!result.cancelled) setSnackbar(result.message);
      return;
    }
    const { image } = result;
    // 弾くときは前の控えも消す。残すと「選び直したつもりが前の画像を送る」事故になる
    if (!ALLOWED_IMAGE_TYPES.includes(image.type)) {
      setPendingImage(null);
      setSnackbar("送れるのは JPEG と PNG だけです（LINE の仕様）。");
      return;
    }
    if (image.size !== null && image.size > MAX_UPLOAD_BYTES) {
      setPendingImage(null);
      setSnackbar("画像が大きすぎます。4MB 以下にしてください。");
      return;
    }
    setPendingImage(image);
  }

  function chooseImageSource() {
    Alert.alert("画像を送る", "送信する画像を選んでください", [
      { text: "カメラで撮影", onPress: () => void pickImageFromCamera().then(stagePicked) },
      { text: "ライブラリから選ぶ", onPress: () => void pickImageFromLibrary().then(stagePicked) },
      { text: "キャンセル", style: "cancel" },
    ]);
  }

  const hasSomethingToSend = !!pendingImage || !!draft.trim();

  /**
   * 画像と文章が両方あるときは 2 通続けて送る。
   * LINE の画像メッセージに本文は付けられないため。片方だけ送って残りを黙って
   * 捨てると、送ったつもりの文章が相手に届かない。
   */
  const onSend = useCallback(async () => {
    if (busy) return;
    const body = draft.trim();
    try {
      if (pendingImage) {
        const res = await sendImageMutation.mutateAsync(pendingImage);
        setPendingImage(null);
        if (!res.delivered) {
          setSnackbar("画像を送信できませんでした。LINE の設定を確認してください。");
          return; // 画像が届いていないなら文章も止めて、状況を確認してもらう
        }
      }
      if (body) {
        const res = await sendMutation.mutateAsync(body);
        setDraft("");
        if (!res.delivered) {
          setSnackbar("送信できませんでした。LINE の設定を確認してください。");
        }
      }
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      queryClient.invalidateQueries({ queryKey: ["message-thread", key] });
      queryClient.invalidateQueries({ queryKey: ["message-threads"] });
    }
  }, [busy, pendingImage, draft, sendMutation, sendImageMutation, queryClient, key]);

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
        <View style={[styles.composerWrap, { paddingBottom: insets.bottom }]}>
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
              disabled={!hasSomethingToSend || busy}
              style={[styles.sendButton, (!hasSomethingToSend || busy) && styles.sendDisabled]}
              accessibilityRole="button"
              accessibilityLabel={pendingImage ? "画像を送信" : "送信"}
            >
              <Icon source="send" size={20} color={colors.textOnPrimary} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.cannotSend, { paddingBottom: spacing.lg + insets.bottom }]}>
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
        // Android は兄弟同士の重なりを elevation で決める。下の固定バーが
        // elevation 3 を持つので、既定（0）のままだと通知が完全に隠れる
        wrapperStyle={{ elevation: 8 }}
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
    backgroundColor: colors.surface,
    ...shadows.bar,
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
    backgroundColor: colors.surface,
    ...shadows.bar,
  },
  cannotSendText: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
});
