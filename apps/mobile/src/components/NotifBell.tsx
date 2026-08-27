import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";

import { useUnreadNotifCount } from "@/hooks/useUnreadNotifCount";
import { colors, sizing, typography } from "@/constants/tokens";

/**
 * 通知ベル（未読バッジ付き）。どの画面からも通知へ行けるようにするための共通部品。
 * タブ画面は TabTopBar 経由、ホームは独自ヘッダーから直接使う。
 */
export function NotifBell() {
  const unread = useUnreadNotifCount();

  return (
    <Pressable
      style={styles.bell}
      onPress={() => router.push("/notifications")}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `通知 ${unread}件の未読` : "通知"}
    >
      <Icon source="bell-outline" size={sizing.iconMd} color={colors.textPrimary} />
      {unread > 0 && (
        <View style={styles.badge}>
          {/* 3桁になると 18pt の丸から溢れるので打ち切る */}
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    ...typography.meta,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
});
