import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";

import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/**
 * 会計中の「うまくいかなかった」を伝えるカード。
 * **会計画面とウォークインの両方**が使う。
 *
 * なぜ切り出したか: タッチ決済の失敗・記録の失敗・支払リンクの失敗で
 * 同じ見た目のブロックが2画面×3個に散っていた。`useCardEntry` を
 * フックにまとめたのと同じ理由で、片方だけ直る事故を避ける。
 */
export function PosNoticeCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  /** 再試行ボタンなど。無ければ文言だけ */
  children?: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{description}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  title: { ...typography.titleMedium, color: colors.textPrimary },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
});
