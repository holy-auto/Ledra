import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { colors, radius, spacing, sizing, shadows } from "@/constants/tokens";

interface Props {
  /** Short imperative label: e.g. "施工を開始する" */
  title: string;
  /** Why this is the next action: e.g. "入庫済み・受付完了" */
  reason?: string;
  /** Target label: e.g. "トヨタ プリウス 品川 300 あ 1234" */
  target?: string;
  icon?: string;
  onPress?: () => void;
}

/**
 * NextActionCard — the single dominant CTA on Home / Job Hub.
 *
 * v2.0: NEXT ACTION has an explainable reason.
 * Hero card radius (24px), Ledra Blue fill, 56px min-height.
 */
export function NextActionCard({
  title,
  reason,
  target,
  icon = "arrow-right-circle",
  onPress,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`次のアクション: ${title}`}
      accessibilityHint={reason}
    >
      <View style={styles.content}>
        <View style={styles.textBlock}>
          {target && (
            <Text style={styles.target} numberOfLines={1}>
              {target}
            </Text>
          )}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {reason && (
            <Text style={styles.reason} numberOfLines={1}>
              {reason}
            </Text>
          )}
        </View>
        <View style={styles.iconWrap}>
          <Icon source={icon} size={sizing.iconLg} color={colors.textOnPrimary} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radius.hero,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    minHeight: 56,
    ...shadows.fab,
  },
  pressed: {
    backgroundColor: colors.primaryDark,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  textBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  target: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.75)",
    lineHeight: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textOnPrimary,
    lineHeight: 24,
  },
  reason: {
    fontSize: 13,
    fontWeight: "400",
    color: "rgba(255,255,255,0.7)",
    lineHeight: 18,
  },
  iconWrap: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: radius.full,
  },
});
