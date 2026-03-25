import { View, StyleSheet } from "react-native";
import { ActivityIndicator, Text } from "react-native-paper";

interface Props {
  message?: string;
}

export function LoadingScreen({ message = "読み込み中..." }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  text: {
    marginTop: 16,
    color: "#71717a",
  },
});
