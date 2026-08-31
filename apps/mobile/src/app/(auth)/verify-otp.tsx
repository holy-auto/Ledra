import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput as RNTextInput,
  Pressable,
  Animated,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";

import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { mobileApi, ApiError } from "@/lib/api";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const { email: paramEmail } = useLocalSearchParams<{ email?: string }>();
  const { user } = useAuthStore();
  const displayEmail = paramEmail || user?.email || "";

  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  const inputRefs = useRef<(RNTextInput | null)[]>([]);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Countdown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // 画面表示時に初回コードを送信する（サインアップ画面はここへ遷移するだけで、
  // 送信自体はこの画面の責務）。失敗しても画面はブロックせず、失敗時は
  // クールダウンを解除してすぐ「再送信」を押せるようにする。
  useEffect(() => {
    mobileApi("/auth/otp/request", { method: "POST" }).catch(() => {
      setCooldown(0);
      setError("コードの送信に失敗しました。再送信してください");
    });
  }, []);

  // Fade in success state
  useEffect(() => {
    if (verified) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }
  }, [verified, fadeAnim]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      // Only accept single digit
      const digit = value.replace(/[^0-9]/g, "").slice(-1);
      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });
      setError("");

      // Auto-focus next input
      if (digit && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    []
  );

  const handleKeyPress = useCallback(
    (index: number, key: string) => {
      // Backspace on empty field focuses previous
      if (key === "Backspace" && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [digits]
  );

  async function handleVerify() {
    const code = digits.join("");
    if (code.length < OTP_LENGTH) {
      setError("6桁のコードを入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await mobileApi("/auth/otp/verify", { method: "POST", body: { code } });
      setVerified(true);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : "認証に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN);
    setError("");
    try {
      await mobileApi("/auth/otp/request", { method: "POST" });
    } catch {
      // 再送信の失敗は静かに扱う。もう一度押し直せるようクールダウンを解除する。
      setCooldown(0);
      setError("再送信に失敗しました。もう一度お試しください");
    }
  }

  function handleNext() {
    router.replace("/(auth)/select-store?fromSignup=1");
  }

  // ── Success state ──
  if (verified) {
    return (
      <View style={styles.screen}>
        <Animated.View style={[styles.successContainer, { opacity: fadeAnim }]}>
          <View style={styles.successIconWrap}>
            <Icon source="check-circle" size={64} color={colors.success} />
          </View>
          <Text style={styles.successTitle}>認証が完了しました</Text>
          <Text style={styles.successSubtitle}>
            アカウントの準備ができました。
          </Text>
          <View style={styles.successButtonWrap}>
            <LedraButton onPress={handleNext}>次へ</LedraButton>
          </View>
        </Animated.View>
      </View>
    );
  }

  // ── Main OTP entry ──
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Icon source="email-outline" size={48} color={colors.primary} />
            </View>
            <Text style={styles.title}>メールを確認</Text>
            <Text style={styles.subtitle}>
              メールに送信した6桁のコードを入力してください
            </Text>
            {displayEmail ? (
              <Text style={styles.email}>{displayEmail}</Text>
            ) : null}
          </View>

          {/* OTP digit inputs */}
          <View style={styles.otpRow}>
            {digits.map((digit, i) => (
              <RNTextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[
                  styles.otpBox,
                  digit ? styles.otpBoxFilled : null,
                  error ? styles.otpBoxError : null,
                ]}
                value={digit}
                onChangeText={(v) => handleDigitChange(i, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                textContentType="oneTimeCode"
                autoFocus={i === 0}
                selectTextOnFocus
                accessibilityLabel={`コード ${i + 1}桁目`}
              />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Resend link */}
          <Pressable
            onPress={handleResend}
            disabled={cooldown > 0}
            style={styles.resendWrap}
          >
            <Text
              style={[
                styles.resendText,
                cooldown > 0 && styles.resendTextDisabled,
              ]}
            >
              コードを再送信
              {cooldown > 0
                ? ` (00:${String(cooldown).padStart(2, "0")})`
                : ""}
            </Text>
          </Pressable>

          {/* Submit button */}
          <View style={styles.buttonWrap}>
            <LedraButton
              onPress={handleVerify}
              loading={loading}
              disabled={loading || digits.join("").length < OTP_LENGTH}
            >
              次へ
            </LedraButton>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing["2xl"],
    paddingTop: 80,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: spacing["3xl"],
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  email: {
    ...typography.label,
    color: colors.primary,
    marginTop: spacing.sm,
  },

  // OTP boxes
  otpRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  otpBox: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    textAlign: "center",
    fontSize: 24,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  otpBoxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  otpBoxError: {
    borderColor: colors.danger,
  },

  // Error
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.md,
  },

  // Resend
  resendWrap: {
    alignItems: "center",
    minHeight: sizing.touchTarget,
    justifyContent: "center",
    marginBottom: spacing.xl,
  },
  resendText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  resendTextDisabled: {
    color: colors.textTertiary,
  },

  // Button
  buttonWrap: {
    marginTop: spacing.md,
  },

  // Success state
  successContainer: {
    flex: 1,
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
  },
  successButtonWrap: {
    alignSelf: "stretch",
    marginTop: spacing["3xl"],
  },
});
