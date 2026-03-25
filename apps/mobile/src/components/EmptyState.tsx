import { View, StyleSheet } from "react-native";
import { Text, Button, Icon } from "react-native-paper";

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
      <Icon source={icon} size={48} color="#a1a1aa" />
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text variant="bodyMedium" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button mode="contained" onPress={onAction} style={styles.button}>
          {actionLabel}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    marginTop: 16,
    color: "#18181b",
    textAlign: "center",
  },
  description: {
    marginTop: 8,
    color: "#71717a",
    textAlign: "center",
  },
  button: {
    marginTop: 24,
  },
});
