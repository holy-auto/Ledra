import { View, StyleSheet, Pressable, TextInput } from "react-native";
import { Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { NotifBell } from "@/components/NotifBell";
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
          // ナンバー・車種・証明書番号を打つ場所。自動修正が働くと別の語に置き換わる
          autoCapitalize="none"
          autoCorrect={false}
        />
        {/* clearButtonMode は iOS 専用で、この×と二重に出るため使わない */}
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

      <NotifBell />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
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
});
