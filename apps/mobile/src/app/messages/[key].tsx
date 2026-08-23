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
} from "react-native";
import { Text, Icon, Snackbar } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { mobileApi } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, sizing, shadows } from "@/constants/tokens";

/**
 * 1 スレッドの会話。テキストの返信だけ扱う。
 *
 * ponytail: 画像の送信は管理画面だけに残している。現場で必要になったら
 * mobileMultipart + サーバ側の multipart 分岐を足す（サーバは対応済み）。
 */

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

  const onSend = useCallback(() => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    sendMutation.mutate(body);
  }, [draft, sendMutation]);

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
        <View style={styles.composer}>
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
            disabled={!draft.trim() || sendMutation.isPending}
            style={[styles.sendButton, (!draft.trim() || sendMutation.isPending) && styles.sendDisabled]}
            accessibilityRole="button"
            accessibilityLabel="送信"
          >
            <Icon source="send" size={20} color={colors.textOnPrimary} />
          </Pressable>
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

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
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
