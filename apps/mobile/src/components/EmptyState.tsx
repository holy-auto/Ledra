import { View, StyleSheet } from "react-native";
import { Text, Icon } from "react-native-paper";
import { LedraButton } from "@/components/ui";
import { colors, spacing } from "@/constants/tokens";

interface Props {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = "inbox-outline",
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      <Icon source={icon} size={48} color={colors.textTertiary} />
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text variant="bodyMedium" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <LedraButton
          variant="primary"
          onPress={onAction}
          style={styles.button}
          fullWidth={false}
        >
          {actionLabel}
        </LedraButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["3xl"],
  },
  title: {
    marginTop: spacing.lg,
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    textAlign: "center",
  },
  button: {
    marginTop: spacing["2xl"],
  },
});
