import { View, StyleSheet, Pressable } from "react-native";
import { Text, Icon, IconButton } from "react-native-paper";
import { colors, radius, spacing } from "@/constants/tokens";

type Severity = "success" | "warning" | "danger" | "info";

interface Props {
  title: string;
  description?: string;
  severity?: Severity;
  icon?: string;
  onPress?: () => void;
  onDismiss?: () => void;
}

const config: Record<Severity, { bg: string; fg: string; border: string; defaultIcon: string }> = {
  success: { bg: colors.successLight, fg: colors.successDark, border: "#A7F3D0", defaultIcon: "check-circle-outline" },
  warning: { bg: colors.warningLight, fg: colors.warningDark, border: "#FDE68A", defaultIcon: "alert-circle-outline" },
  danger: { bg: colors.dangerLight, fg: colors.dangerDark, border: "#FECACA", defaultIcon: "alert-outline" },
  info: { bg: colors.infoLight, fg: colors.infoDark, border: "#C7D2FE", defaultIcon: "information-outline" },
};

/**
 * LedraAlert — dismissible notification banner.
 * Pale tint backgrounds per spec.
 */
export function LedraAlert({
  title,
  description,
  severity = "info",
  icon,
  onPress,
  onDismiss,
}: Props) {
  const c = config[severity];
  const Container = onPress ? Pressable : View;

  return (
    <Container
      style={[styles.alert, { backgroundColor: c.bg, borderColor: c.border }]}
      {...(onPress ? { onPress } : {})}
      accessibilityRole="alert"
    >
      <Icon source={icon ?? c.defaultIcon} size={20} color={c.fg} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: c.fg }]}>{title}</Text>
        {description && (
          <Text style={[styles.description, { color: c.fg }]}>{description}</Text>
        )}
      </View>
      {onDismiss && (
        <IconButton
          icon="close"
          size={16}
          iconColor={c.fg}
          onPress={onDismiss}
          accessibilityLabel="閉じる"
          style={{ margin: 0 }}
        />
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.md,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
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
