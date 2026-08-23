import { useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

/**
 * LINE などから届いた顧客メッセージの受信箱。
 *
 * Supabase 直読みではなく API 経由なのは、スレッドへの畳み込みが直近1000件の
 * スキャン + 集約で、端末側でやると転送量が重いため（サーバ側と同じ理由）。
 */

interface Thread {
  thread_key: string;
  customer_id: string | null;
  line_user_id: string | null;
  email_from: string | null;
  channel: string;
  last_body: string;
  last_direction: "inbound" | "outbound";
  last_created_at: string;
  unread_count: number;
  message_count: number;
  candidate_count: number;
  customer_name: string | null;
}

const CHANNEL_ICON: Record<string, string> = {
  line: "chat",
  email: "email-outline",
  sms: "message-text-outline",
};

/** 顧客名 → LINE ID → メールアドレスの順で、分かる範囲の呼び名を出す */
function threadLabel(t: Thread): string {
  if (t.customer_name) return t.customer_name;
  if (t.email_from) return t.email_from;
  if (t.line_user_id) return "LINE ユーザー（未登録）";
  return "不明な相手";
}

function relativeTime(iso: string): string {
  const d = dayjs(iso);
  const diffMin = dayjs().diff(d, "minute");
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}日前`;
  return d.format("M/D");
}

export default function MessagesScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["message-threads", user?.tenantId],
    queryFn: () =>
      mobileApi<{ threads: Thread[]; total_unread: number; truncated: boolean }>("/messages"),
    enabled: !!user?.tenantId,
    refetchInterval: 30_000,
  });

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // 引っ張って更新の失敗は画面に出さない（次の自動更新で回復する）
    }
  }, [refetch]);

  const renderItem = ({ item }: { item: Thread }) => {
    const unread = item.unread_count > 0;
    return (
      <Pressable
        style={[styles.card, unread && styles.cardUnread]}
        // thread_key は "c:uuid" のようにコロンを含む。パスに載せるので encode する
        onPress={() => router.push(`/messages/${encodeURIComponent(item.thread_key)}` as never)}
        accessibilityRole="button"
        accessibilityLabel={`${threadLabel(item)} との会話${unread ? ` 未読${item.unread_count}件` : ""}`}
      >
        <View style={styles.channelIcon}>
          <Icon
            source={CHANNEL_ICON[item.channel] ?? "chat-outline"}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.name, unread && styles.nameUnread]} numberOfLines={1}>
              {threadLabel(item)}
            </Text>
            <Text style={styles.time}>{relativeTime(item.last_created_at)}</Text>
          </View>
          <Text style={styles.preview} numberOfLines={2}>
            {item.last_direction === "outbound" ? "↩ " : ""}
            {item.last_body || "（添付のみ）"}
          </Text>
          <View style={styles.badgeRow}>
            {unread && <StatusBadge label={`未読 ${item.unread_count}`} severity="danger" compact />}
            {item.candidate_count > 0 && (
              <StatusBadge label={`予約候補 ${item.candidate_count}`} severity="info" compact />
            )}
          </View>
        </View>
        <Icon source="chevron-right" size={18} color={colors.textTertiary} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={data?.threads ?? []}
        keyExtractor={(t) => t.thread_key}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          data?.truncated ? (
            <Text style={styles.truncated}>
              件数が多いため直近の会話のみ表示しています。古い会話は管理画面で確認してください。
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="chat-outline"
            title="メッセージはまだありません"
            description="LINE で顧客から届いたメッセージがここに表示されます"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing["3xl"] },
  truncated: {
    ...typography.meta,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    minHeight: sizing.touchTarget,
    ...shadows.card,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  channelIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: spacing.xs },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  name: { ...typography.titleSmall, color: colors.textPrimary, flex: 1 },
  nameUnread: { fontWeight: "700" },
  time: { ...typography.meta, color: colors.textTertiary, flexShrink: 0 },
  preview: { ...typography.bodySmall, color: colors.textSecondary },
  badgeRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
});
