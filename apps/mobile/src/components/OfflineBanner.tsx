import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useNetworkStatus,
  isEffectivelyOffline,
} from "@/hooks/useNetworkStatus";
import { colors, spacing } from "@/constants/tokens";

/**
 * 画面最上部に表示するオフラインバナー。
 * 接続中は何も描画しない (null)。屋外整備で電波が切れたとき即座に
 * ユーザーに気付かせる用途。
 *
 * ponytail: useSafeAreaInsets で notch / Dynamic Island 分の paddingTop を確保
 */
export function OfflineBanner() {
  const status = useNetworkStatus();
  const insets = useSafeAreaInsets();
  if (!isEffectivelyOffline(status)) return null;

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + spacing.sm }]}
      accessibilityRole="alert"
    >
      <Icon source="cloud-off-outline" size={16} color={colors.textOnPrimary} />
      <Text variant="labelMedium" style={styles.text}>
        {/* D-A9 是正 (2026-09-08): オフラインキューは未実装（docs/mobile-features.md §5.3 は
            計画のみで apps/mobile/src/offline/ は存在しない）。「復帰後に同期される」は
            事実と異なり、書込みは失敗するのに大丈夫だと誤解させ現場でのデータ消失に
            つながる。接続復帰まで操作を控えるよう案内する文言に変更。 */}
        オフラインです。書込み操作は失敗します。接続が復帰してからお試しください。
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
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  text: { color: colors.textOnPrimary, fontWeight: "600" },
});
