import { View, StyleSheet } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";
import { colors } from "@/constants/tokens";

interface Props {
  message?: string;
}

export function LoadingScreen({ message = "読み込み中..." }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  text: {
    marginTop: 16,
    color: colors.textSecondary,
  },
});
