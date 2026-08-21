import { View, StyleSheet } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { colors } from "@/constants/tokens";

/**
 * 証明タブ — v2.0 正準 5 タブの 1 つ。
 * UI-060 で Certificate 画面として本格実装予定。
 */
export default function CertificatesScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="certificate-outline"
        title="発行済み証明書はありません"
        description="施工完了後、品質確認を経て証明書が発行されます"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
