import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";

/**
 * 車両タブ画面（IMP-020 プレースホルダ）。
 *
 * ponytail: 車両一覧の実装は IMP-025（車両パスポート基盤）。
 * ここではタブ構造のみ確立する。
 */
export default function VehiclesScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        車両管理
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        車両一覧がここに表示されます
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa", padding: 24 },
  title: { color: "#1a1a2e", fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#71717a", textAlign: "center" },
});
