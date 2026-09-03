import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Icon, Text } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius, spacing, sizing } from "@/constants/tokens";
import { type DisplayMode, useUiPreferencesStore } from "@/stores/uiPreferencesStore";

type WorkRole = "reception" | "technician" | "manager" | "owner";

const ROLES: { id: WorkRole; label: string }[] = [
  { id: "reception", label: "受付・予約" },
  { id: "technician", label: "施工・作業" },
  { id: "manager", label: "店舗管理" },
  { id: "owner", label: "経営・管理" },
];

const MODES: { id: DisplayMode; label: string; description: string }[] = [
  { id: "simple", label: "かんたん表示", description: "次にすることを大きく案内" },
  { id: "standard", label: "標準表示", description: "案内と一覧をバランスよく表示" },
  { id: "dense", label: "一覧重視", description: "多くの案件を一度に確認" },
];

export function DisplayModeOnboarding() {
  const insets = useSafeAreaInsets();
  const loading = useUiPreferencesStore((state) => state.loading);
  const completed = useUiPreferencesStore((state) => state.onboardingCompleted);
  const displayMode = useUiPreferencesStore((state) => state.deviceOverride ?? state.accountMode);
  const complete = useUiPreferencesStore((state) => state.completeOnboarding);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<WorkRole | null>(null);
  const [mode, setMode] = useState<DisplayMode>("standard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const wasOpen = useRef(false);

  const recommendation = useMemo<DisplayMode>(() => {
    if (role === "owner") return "dense";
    if (role === "reception" || role === "manager") return "standard";
    return "simple";
  }, [role]);

  useEffect(() => {
    const open = !loading && !completed;
    if (open && !wasOpen.current) {
      setStep(0);
      setRole(null);
      setMode(displayMode);
      setError("");
    }
    wasOpen.current = open;
  }, [completed, displayMode, loading]);

  async function finish(selected = mode) {
    setSaving(true);
    setError("");
    try {
      await complete(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "設定を保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={!loading && !completed}
      transparent
      animationType="slide"
      onRequestClose={() => void finish("standard")}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.topRow}>
              <Text style={styles.step}>初回設定 {step + 1} / 3</Text>
              <Pressable onPress={() => void finish("standard")} disabled={saving} hitSlop={8}>
                <Text style={styles.skip}>標準で始める</Text>
              </Pressable>
            </View>
            <Text style={styles.heading}>
              {step === 0
                ? "主に担当する仕事を教えてください"
                : step === 1
                  ? "見やすい表示を選びます"
                  : "この表示で始めます"}
            </Text>

            {step === 0 && (
              <View style={styles.roleGrid}>
                {ROLES.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => setRole(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: role === option.id }}
                    style={[styles.roleCard, role === option.id && styles.selectedCard]}
                  >
                    <Text style={[styles.roleLabel, role === option.id && styles.selectedLabel]}>{option.label}</Text>
                    {role === option.id && <Icon source="check-circle" size={20} color={colors.primary} />}
                  </Pressable>
                ))}
              </View>
            )}

            {step === 1 && (
              <View style={styles.modeList}>
                {MODES.map((option) => (
                  <Pressable
                    key={option.id}
                    onPress={() => setMode(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === option.id }}
                    style={[styles.modeCard, mode === option.id && styles.selectedCard]}
                  >
                    <View style={styles.modeCopy}>
                      <Text style={styles.modeLabel}>{option.label}</Text>
                      <Text style={styles.description}>{option.description}</Text>
                    </View>
                    <View style={styles.modeState}>
                      {option.id === recommendation && <Text style={styles.recommended}>おすすめ</Text>}
                      {mode === option.id && <Icon source="check-circle" size={20} color={colors.primary} />}
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {step === 2 && (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>選択した表示</Text>
                <Text style={styles.previewMode}>{MODES.find((option) => option.id === mode)?.label}</Text>
                <View style={styles.previewBars}>
                  <View style={[styles.previewBar, { width: "100%" }]} />
                  <View style={[styles.previewBar, { width: mode === "simple" ? "65%" : "88%" }]} />
                  {mode !== "simple" && <View style={[styles.previewBar, { width: "74%" }]} />}
                </View>
                <Text style={styles.description}>表示は「その他 → 表示設定」からいつでも変更できます。</Text>
              </View>
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}
          </ScrollView>
          <View style={[styles.actions, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <Pressable
              onPress={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
              style={[styles.secondaryButton, step === 0 && styles.hidden]}
            >
              <Text style={styles.secondaryText}>戻る</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (step === 0) {
                  setMode(recommendation);
                  setStep(1);
                } else if (step === 1) setStep(2);
                else void finish();
              }}
              disabled={(step === 0 && !role) || saving}
              style={[styles.primaryButton, ((step === 0 && !role) || saving) && styles.disabled]}
            >
              <Text style={styles.primaryText}>
                {step === 2 ? (saving ? "保存中..." : "この表示で始める") : "次へ"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  sheet: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  scroll: { flexShrink: 1 },
  content: { padding: spacing["2xl"] },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: { fontSize: 12, fontWeight: "700", color: colors.primary },
  skip: { fontSize: 13, fontWeight: "600", color: colors.textSecondary, minHeight: sizing.touchTarget },
  heading: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  roleCard: {
    width: "47%",
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  selectedCard: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  roleLabel: { flexShrink: 1, fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  selectedLabel: { color: colors.primary },
  modeList: { gap: spacing.md },
  modeCard: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modeCopy: { flex: 1 },
  modeState: { alignItems: "flex-end", gap: spacing.sm },
  modeLabel: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
  description: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  recommended: {
    overflow: "hidden",
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 11,
    fontWeight: "700",
    color: colors.textOnPrimary,
  },
  preview: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.xl,
  },
  previewLabel: { fontSize: 13, color: colors.textSecondary },
  previewMode: { marginTop: 4, fontSize: 24, fontWeight: "700", color: colors.textPrimary },
  previewBars: { marginVertical: spacing.xl, gap: spacing.sm },
  previewBar: { height: 14, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  error: { marginTop: spacing.md, color: colors.danger },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    minHeight: sizing.ctaHeight,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
  },
  primaryText: { fontSize: 15, fontWeight: "700", color: colors.textOnPrimary },
  secondaryButton: {
    minHeight: sizing.ctaHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.xl,
  },
  secondaryText: { fontSize: 15, fontWeight: "600", color: colors.textSecondary },
  disabled: { opacity: 0.4 },
  hidden: { opacity: 0 },
});
