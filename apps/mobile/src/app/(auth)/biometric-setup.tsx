import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { Pressable } from "react-native";

import { LedraButton } from "@/components/ui";
import { enableAppLockVerified } from "@/lib/appLock";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

const BENEFITS = [
  "アプリを開くたびに Face ID / 指紋で本人確認",
  "端末を貸しても顧客情報を見られない",
  "パスワードの再入力は不要",
] as const;

export default function BiometricSetupScreen() {
  const [setupDone, setSetupDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const successFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (setupDone) {
      // Cross-fade from setup to success
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(successFade, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [setupDone, fadeAnim, successFade]);

  async function handleSetup() {
    setLoading(true);
    setError("");
    try {
      const result = await enableAppLockVerified();
      if (result === "ok") {
        setSetupDone(true);
        return;
      }
      setError(
        result === "unsupported"
          ? "この端末では生体認証が使えません。端末の設定で Face ID / 指紋を登録してください。"
          : result === "cancelled"
            ? "認証がキャンセルされました"
            : "生体認証を確認できませんでした",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    router.replace("/(auth)/onboarding");
  }

  function handleNext() {
    router.replace("/(auth)/onboarding");
  }

  return (
    <View style={styles.screen}>
      {/* Setup view */}
      <Animated.View
        style={[styles.container, { opacity: fadeAnim }]}
        pointerEvents={setupDone ? "none" : "auto"}
      >
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Icon source="lock-outline" size={48} color={colors.primary} />
        </View>

        {/* Title */}
        <Text style={styles.title}>生体認証の設定</Text>
        <Text style={styles.subtitle}>
          一度ログインすると次回から素通りになります。その手前に本人確認を挟みます。
        </Text>

        {/* Benefits */}
        <View style={styles.benefitsList}>
          {BENEFITS.map((text) => (
            <View key={text} style={styles.benefitRow}>
              <View style={styles.checkWrap}>
                <Icon
                  source="check-circle"
                  size={20}
                  color={colors.success}
                />
              </View>
              <Text style={styles.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* CTA */}
        <View style={styles.ctaArea}>
          <LedraButton
            onPress={handleSetup}
            loading={loading}
            disabled={loading}
          >
            設定する
          </LedraButton>

          <Pressable
            onPress={handleSkip}
            disabled={loading}
            style={styles.skipWrap}
          >
            <Text style={styles.skipText}>あとで設定する</Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Success view (overlaid, fades in) */}
      {setupDone && (
        <Animated.View
          style={[styles.successOverlay, { opacity: successFade }]}
        >
          <View style={styles.successIconWrap}>
            <Icon source="check-circle" size={64} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>生体認証の設定完了</Text>
          <Text style={styles.successSubtitle}>
            生体認証を有効にしました
          </Text>
          <Text style={styles.successDetail}>
            次回の起動から本人確認が入ります
          </Text>
          <View style={styles.successButtonWrap}>
            <LedraButton onPress={handleNext}>次へ</LedraButton>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },

  // Icon
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["2xl"],
  },

  // Title
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: spacing["3xl"],
  },

  // Benefits
  benefitsList: {
    alignSelf: "stretch",
    gap: spacing.lg,
    marginBottom: spacing["3xl"],
  },
  benefitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  checkWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  benefitText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },

  // Error
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.lg,
  },

  // CTA area
  ctaArea: {
    alignSelf: "stretch",
    gap: spacing.lg,
  },
  skipWrap: {
    alignItems: "center",
    minHeight: sizing.touchTarget,
    justifyContent: "center",
  },
  skipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },

  // Success overlay
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },
  successIconWrap: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing["2xl"],
  },
  successTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  successSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  successDetail: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  successButtonWrap: {
    alignSelf: "stretch",
    marginTop: spacing["3xl"],
  },
});
