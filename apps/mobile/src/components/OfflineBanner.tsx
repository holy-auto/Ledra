import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import {
  useNetworkStatus,
  isEffectivelyOffline,
} from "@/hooks/useNetworkStatus";
import { colors, spacing } from "@/constants/tokens";

/**
 * 画面最上部に表示するオフラインバナー。
 * 接続中は何も描画しない (null)。屋外整備で電波が切れたとき即座に
 * ユーザーに気付かせる用途。
 */
export function OfflineBanner() {
  const status = useNetworkStatus();
  if (!isEffectivelyOffline(status)) return null;

  return (
    <View style={styles.container} accessibilityRole="alert">
      <Icon source="cloud-off-outline" size={16} color={colors.textOnPrimary} />
      <Text variant="labelMedium" style={styles.text}>
        オフラインです。書込み操作は接続復帰後に同期されます。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerDark,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  text: { color: colors.textOnPrimary, fontWeight: "600" },
});
