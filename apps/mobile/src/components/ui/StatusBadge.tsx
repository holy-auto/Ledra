import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import { colors, radius, spacing } from "@/constants/tokens";

type Severity = "success" | "warning" | "danger" | "info" | "neutral";

interface Props {
  label: string;
  severity?: Severity;
  icon?: string;
  /** Compact mode for inline use (smaller padding). */
  compact?: boolean;
}

const severityStyles: Record<Severity, { bg: string; fg: string }> = {
  success: { bg: colors.successLight, fg: colors.successDark },
  warning: { bg: colors.warningLight, fg: colors.warningDark },
  danger: { bg: colors.dangerLight, fg: colors.dangerDark },
  info: { bg: colors.infoLight, fg: colors.infoDark },
  neutral: { bg: colors.surfaceVariant, fg: colors.textSecondary },
};

/**
 * StatusBadge — pill-shaped status indicator.
 * Uses pale severity tints per spec (no saturated fills).
 */
export function StatusBadge({ label, severity = "neutral", icon, compact }: Props) {
  const s = severityStyles[severity];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: s.bg },
        compact && styles.compact,
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {icon && <Icon source={icon} size={14} color={s.fg} />}
      <Text style={[styles.label, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  compact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
  },
});
