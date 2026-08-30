import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { colors, radius, spacing, shadows } from "@/constants/tokens";

type Severity = "success" | "warning" | "danger" | "info" | "neutral";

interface Props {
  title: string;
  description?: string;
  severity?: Severity;
  icon?: string;
  onPress?: () => void;
  /** Right-side content (badge, count, etc.) */
  trailing?: React.ReactNode;
}

const severityConfig: Record<Severity, { bg: string; fg: string; iconColor: string; border: string }> = {
  success: { bg: colors.successLight, fg: colors.successDark, iconColor: colors.success, border: "#A7F3D0" },
  warning: { bg: colors.warningLight, fg: colors.warningDark, iconColor: colors.warning, border: "#FDE68A" },
  danger: { bg: colors.dangerLight, fg: colors.dangerDark, iconColor: colors.danger, border: "#FECACA" },
  info: { bg: colors.infoLight, fg: colors.infoDark, iconColor: colors.info, border: "#C7D2FE" },
  neutral: { bg: colors.surface, fg: colors.textPrimary, iconColor: colors.textSecondary, border: colors.border },
};

/**
 * StatusCard — action-needed item with pale severity background.
 *
 * v2.0: pale severity surface tints, never saturated fills.
 * Touch-safe (44px min), card radius 20px.
 */
export function StatusCard({
  title,
  description,
  severity = "neutral",
  icon,
  onPress,
  trailing,
}: Props) {
  const cfg = severityConfig[severity];
  const Wrapper = onPress ? Pressable : View;

  return (
    <Wrapper
      style={[styles.card, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
      {...(onPress ? { onPress, accessibilityRole: "button" as const } : {})}
    >
      {icon && (
        <View style={styles.iconWrap}>
          <Icon source={icon} size={20} color={cfg.iconColor} />
        </View>
      )}
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: cfg.fg }]} numberOfLines={2}>
          {title}
        </Text>
        {description && (
          <Text style={[styles.description, { color: cfg.fg }]} numberOfLines={2}>
            {description}
          </Text>
        )}
      </View>
      {trailing}
      {onPress && (
        <Icon source="chevron-right" size={20} color={cfg.fg} />
      )}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
    minHeight: 56,
    ...shadows.card,
  },
  iconWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: radius.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  description: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
    opacity: 0.85,
  },
});
