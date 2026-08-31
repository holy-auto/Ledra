import { useEffect, useState } from "react";
import { StyleSheet, Switch, View } from "react-native";
import { Text } from "react-native-paper";
import { SegmentedControl } from "@/components/ui";
import { colors, radius, spacing } from "@/constants/tokens";
import { type DisplayMode, useDisplayMode, useUiPreferencesStore } from "@/stores/uiPreferencesStore";

const MODES: { value: DisplayMode; label: string }[] = [
  { value: "simple", label: "かんたん" },
  { value: "standard", label: "標準" },
  { value: "dense", label: "一覧" },
];

const MODE_DESCRIPTIONS: Record<DisplayMode, string> = {
  simple: "次にすることを大きく表示します。",
  standard: "案内と一覧をバランスよく表示します。",
  dense: "多くの案件を一度に確認できます。",
};

export function DisplayModeControl({ compact = false }: { compact?: boolean }) {
  const displayMode = useDisplayMode();
  const deviceOverride = useUiPreferencesStore((state) => state.deviceOverride);
  const setDisplayMode = useUiPreferencesStore((state) => state.setDisplayMode);
  const clearDeviceOverride = useUiPreferencesStore((state) => state.clearDeviceOverride);
  const [deviceOnlyChoice, setDeviceOnlyChoice] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const deviceOnly = deviceOnlyChoice ?? Boolean(deviceOverride);

  useEffect(() => {
    if (!message || messageIsError) return;
    const timer = setTimeout(() => setMessage(""), 2500);
    return () => clearTimeout(timer);
  }, [message, messageIsError]);

  async function choose(mode: DisplayMode) {
    setMessage("");
    setMessageIsError(false);
    try {
      await setDisplayMode(mode, deviceOnly ? "device" : "account");
      setMessage(deviceOnly ? "この端末の表示を変更しました" : "Web版と共通の表示を変更しました");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "表示を変更できませんでした");
    }
  }

  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      {!compact && (
        <View style={styles.headingRow}>
          <View>
            <Text style={styles.eyebrow}>表示切替</Text>
            <Text style={styles.title}>仕事に合わせて見やすく</Text>
          </View>
        </View>
      )}
      <SegmentedControl segments={MODES} value={displayMode} onChange={(mode) => void choose(mode)} />
      {!compact && (
        <>
          <Text style={styles.modeDescription}>{MODE_DESCRIPTIONS[displayMode]}</Text>
          <View style={styles.scopeRow}>
            <View style={styles.scopeCopy}>
              <Text style={styles.scopeLabel}>この端末だけ変更</Text>
              <Text style={styles.scopeDescription}>オフならWeb版と同じ表示になります</Text>
            </View>
            <Switch
              value={deviceOnly}
              onValueChange={(value) => {
                setDeviceOnlyChoice(value);
                if (!value && deviceOverride) void clearDeviceOverride();
              }}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={deviceOnly ? colors.primary : colors.textTertiary}
            />
          </View>
        </>
      )}
      {!compact && !!message && (
        <Text style={[styles.message, messageIsError && styles.error]} accessibilityLiveRegion="polite">
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  compactCard: {
    borderWidth: 0,
    padding: 0,
    backgroundColor: "transparent",
  },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 11, fontWeight: "700", color: colors.primary, letterSpacing: 0.8 },
  title: { marginTop: 2, fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  modeDescription: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
  scopeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  scopeCopy: { flex: 1, paddingRight: spacing.md },
  scopeLabel: { fontSize: 14, color: colors.textSecondary },
  scopeDescription: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.textTertiary },
  message: { fontSize: 12, color: colors.textSecondary },
  error: { color: colors.danger },
});
