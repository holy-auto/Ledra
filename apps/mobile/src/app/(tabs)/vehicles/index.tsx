import { View, StyleSheet } from "react-native";
import { EmptyState } from "@/components/EmptyState";
import { colors } from "@/constants/tokens";

/**
 * 車両タブ — v2.0 正準 5 タブの 1 つ。
 * UI-060 で Vehicle Passport として本格実装予定。
 */
export default function VehiclesScreen() {
  return (
    <View style={styles.container}>
      <EmptyState
        icon="car-outline"
        title="車両がまだ登録されていません"
        description="車両を登録すると、作業履歴や証明書と紐付けて管理できます"
        actionLabel="車両を追加"
        onAction={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
