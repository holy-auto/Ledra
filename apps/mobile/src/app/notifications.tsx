import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { notificationTarget } from "@/lib/notificationTarget";
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
  notification_type: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * notification_type → アイコン。キーは Web の通知タイプカタログ
 * (`src/lib/notifications/types.ts` の NOTIFICATION_TYPE_CATALOG) と一致させる。
 *
 * 以前のキーは certificate / work / sync / error / system で、**実際に DB へ書かれる
 * notification_type と1つも一致していなかった**（本番の通知60件が全部 DEFAULT_ICON の
 * ベルになっていた）。モバイルは Web の `src/lib` を import できない（`@/*` は
 * `apps/mobile/src` のみ）ため表はこちらに持ち、カタログとのズレは Web 側の
 * 構造テスト `src/lib/notifications/__tests__/mobileIcons.test.ts` が検出する。
 *
 * アイコンはカタログの category 単位。色は原則 severity 単位
 * （urgent=danger / action_required=warning / informational=控えめ）だが、
 * 次の3つは意図的に外している:
 *  - chat_message (action_required) は primary。本番通知60件のうち56件がこれで、
 *    warning にすると一覧がほぼ全部「警告色」になり、色で区別する意味が消える
 *  - payment_confirmed / certificate_issued (informational) は success。
 *    「完了した」ことが読み取れる方が有用な種類のため
 */
const TYPE_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  // booking
  booking_created: { icon: "calendar-check", color: colors.warning, bg: colors.warningLight },
  // job
  order_created: { icon: "wrench", color: colors.warning, bg: colors.warningLight },
  order_accepted: { icon: "wrench", color: colors.textSecondary, bg: colors.surfaceVariant },
  order_completed: { icon: "wrench", color: colors.textSecondary, bg: colors.surfaceVariant },
  order_cancelled: { icon: "wrench", color: colors.textSecondary, bg: colors.surfaceVariant },
  // payment
  payment_confirmed: { icon: "credit-card-outline", color: colors.success, bg: colors.successLight },
  // certificate
  certificate_gate_ready: { icon: "shield-check", color: colors.warning, bg: colors.warningLight },
  certificate_issued: { icon: "shield-check", color: colors.success, bg: colors.successLight },
  // customer
  customer_concern_raised: { icon: "account-alert", color: colors.danger, bg: colors.dangerLight },
  rating_request: { icon: "star-outline", color: colors.textSecondary, bg: colors.surfaceVariant },
  rating_received: { icon: "star-outline", color: colors.textSecondary, bg: colors.surfaceVariant },
  // sla
  sla_at_risk: { icon: "clock-alert-outline", color: colors.warning, bg: colors.warningLight },
  sla_overdue: { icon: "clock-alert-outline", color: colors.danger, bg: colors.dangerLight },
  // system
  platform_notification: { icon: "information", color: colors.textSecondary, bg: colors.surfaceVariant },
  // ai
  ai_action: { icon: "robot-outline", color: colors.warning, bg: colors.warningLight },
  // message
  chat_message: { icon: "message-text-outline", color: colors.primary, bg: colors.primaryLight },
  // inventory
  low_stock_alert: { icon: "package-variant", color: colors.warning, bg: colors.warningLight },
  // maintenance
  follow_up_reminder: { icon: "calendar-clock", color: colors.textSecondary, bg: colors.surfaceVariant },
};

const DEFAULT_ICON = { icon: "bell", color: colors.textSecondary, bg: colors.surfaceVariant };

const FILTER_SEGMENTS: { value: NotifFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "unread", label: "未読" },
];

export default function NotificationsScreen() {
  const { user } = useAuthStore();
  const [filter, setFilter] = useState<NotifFilter>("all");
  const queryClient = useQueryClient();

  const {
    data: notifications = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // ponytail: notification_type / read_at が正しいカラム名（type / read は存在しない）
      // user_id IS NULL はテナント全体への通知
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, notification_type, link_path, read_at, created_at")
        .or(`user_id.is.null,user_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data ?? []) as unknown as NotificationItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", notifId)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      // 各画面のベル（useUnreadNotifCount）も更新する
      queryClient.invalidateQueries({ queryKey: ["notif-unread-count"] });
    },
  });

  const isUnread = (n: NotificationItem) => n.read_at === null;

  const filtered =
    filter === "all"
      ? notifications
      : notifications.filter(isUnread);

  const unreadCount = notifications.filter(isUnread).length;

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
    const iconCfg = TYPE_ICON[item.notification_type ?? ""] ?? DEFAULT_ICON;
    const unread = isUnread(item);
    // 対応する画面がある通知だけ「開ける」見た目にする
    const target = notificationTarget(item.link_path);

    return (
      <Pressable
        style={[styles.card, unread && styles.cardUnread]}
        onPress={() => {
          if (unread) markReadMutation.mutate(item.id);
          if (target) router.push(target as never);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}${unread ? " 未読" : ""}${target ? " 開く" : ""}`}
      >
        <View style={[styles.iconContainer, { backgroundColor: iconCfg.bg }]}>
          <Icon source={iconCfg.icon} size={20} color={iconCfg.color} />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardTitleRow}>
            <Text
              style={[styles.titleText, unread && styles.titleUnread]}
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
        {target && (
          <Icon source="chevron-right" size={18} color={colors.textTertiary} />
        )}
        {unread && <View style={styles.unreadDot} />}
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
    paddingBottom: spacing.md,
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
