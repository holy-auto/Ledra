import { View, StyleSheet, Pressable, TextInput } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUnreadNotifCount } from "@/hooks/useUnreadNotifCount";
import { colors, spacing, radius, sizing, typography } from "@/constants/tokens";

/**
 * タブ画面の共通トップバー。
 *
 * 画面名（「作業」「車両」…）はタブバーのアイコンで既に分かるので、その一等地を
 * 検索に譲る。通知のベルはどの画面からも押せるようここに常設する。
 */
export function TabTopBar({
  search,
  onSearchChange,
  placeholder,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  placeholder: string;
}) {
  const unread = useUnreadNotifCount();
  // ヘッダー非表示なので、ステータスバーに潜り込まないよう上端は自前で空ける
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.searchBox}>
        <Icon source="magnify" size={20} color={colors.textTertiary} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={onSearchChange}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {!!search && (
          <Pressable
            onPress={() => onSearchChange("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="検索条件をクリア"
          >
            <Icon source="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      <Pressable
        style={styles.bell}
        onPress={() => router.push("/notifications")}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `通知 ${unread}件の未読` : "通知"}
      >
        <Icon source="bell-outline" size={sizing.iconMd} color={colors.textPrimary} />
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    height: sizing.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
  },
  input: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.textPrimary,
    padding: 0,
  },
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
