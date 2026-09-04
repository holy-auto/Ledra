import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { DisplayModeControl } from "@/components/DisplayModeControl";
import { LedraButton } from "@/components/ui";
import { colors, spacing, typography } from "@/constants/tokens";
import { useUiPreferencesStore } from "@/stores/uiPreferencesStore";

export default function DisplaySettingsScreen() {
  const restartOnboarding = useUiPreferencesStore((state) => state.restartOnboarding);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>表示方法</Text>
      <Text style={styles.description}>
        機能や権限は変えず、ホーム画面に表示する情報量だけを変更します。
      </Text>

      <DisplayModeControl />

      <View style={styles.help}>
        <Text style={styles.helpTitle}>どれを選ぶか迷ったら</Text>
        <Text style={styles.helpText}>担当業務について答えると、使い方に合う表示を提案します。</Text>
        <LedraButton variant="outline" fullWidth onPress={() => void restartOnboarding()}>
          選び方をもう一度確認
        </LedraButton>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  heading: { ...typography.titleLarge, color: colors.textPrimary },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  help: { marginTop: spacing.md, gap: spacing.md },
  helpTitle: { ...typography.titleSmall, color: colors.textPrimary },
  helpText: { ...typography.bodySmall, color: colors.textSecondary },
});
