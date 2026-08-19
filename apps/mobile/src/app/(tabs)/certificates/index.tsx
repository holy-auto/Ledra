import { View, StyleSheet } from "react-native";
import { Text } from "react-native-paper";

/**
 * 証明書タブ画面（IMP-020 プレースホルダ）。
 *
 * ponytail: 証明書一覧の実装は IMP-028（Certificate Gate・発行・公開検証）。
 * ここではタブ構造のみ確立する。
 */
export default function CertificatesScreen() {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        証明書
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        証明書一覧がここに表示されます
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa", padding: 24 },
  title: { color: "#1a1a2e", fontWeight: "700", marginBottom: 8 },
  subtitle: { color: "#71717a", textAlign: "center" },
});
