import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { SegmentedControl, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  colors,
  spacing,
  radius,
  typography,
  shadows,
} from "@/constants/tokens";

type NotifFilter = "all" | "unread";

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
}

const TYPE_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  certificate: { icon: "shield-check", color: colors.success, bg: colors.successLight },
  work: { icon: "wrench", color: colors.primary, bg: colors.primaryLight },
  sync: { icon: "cloud-sync", color: colors.info, bg: colors.infoLight },
  error: { icon: "alert-circle", color: colors.danger, bg: colors.dangerLight },
  system: { icon: "information", color: colors.textSecondary, bg: colors.surfaceVariant },
};

const DEFAULT_ICON = { icon: "bell", color: colors.textSecondary, bg: colors.surfaceVariant };

const FILTER_SEGMENTS: { value: NotifFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "unread", label: "未読" },
];

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<NotifFilter>("all");

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, type, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as NotificationItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter((n) => !n.read);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ponytail: swallow
    }
  }, [refetch]);

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "たった今";
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}時間前`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}日前`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const iconCfg = TYPE_ICON[item.type ?? ""] ?? DEFAULT_ICON;

    return (
      <Pressable
        style={[styles.card, !item.read && styles.cardUnread]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} ${item.read ? "" : "未読"}`}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconCfg.bg }]}>
          <Icon source={iconCfg.icon} size={20} color={iconCfg.color} />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text
              style={[styles.titleText, !item.read && styles.titleUnread]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.timeText}>{formatTime(item.created_at)}</Text>
          </View>
          {item.body && (
            <Text style={styles.bodyText} numberOfLines={2}>
              {item.body}
            </Text>
          )}
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with filter + unread count */}
      <View style={styles.headerRow}>
        <SegmentedControl
          segments={FILTER_SEGMENTS}
          value={filter}
          onChange={setFilter}
        />
        {unreadCount > 0 && (
          <StatusBadge
            label={`${unreadCount}件未読`}
            severity="info"
            compact
          />
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="bell-outline"
            title={
              filter === "unread"
                ? "未読の通知はありません"
                : "通知はまだありません"
            }
            description="新しい作業や証明書の更新があると通知されます"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
    gap: spacing.sm,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: { flex: 1 },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.sm,
  },
  titleText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },
  titleUnread: {
    fontWeight: "600",
  },
  timeText: {
    ...typography.meta,
    color: colors.textTertiary,
    flexShrink: 0,
  },
  bodyText: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: spacing.xs,
  },
});
