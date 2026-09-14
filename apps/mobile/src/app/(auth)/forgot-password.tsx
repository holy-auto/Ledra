import { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Text, TextInput, HelperText, Icon } from "react-native-paper";
import { router } from "expo-router";

import { supabase } from "@/lib/supabase";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleReset() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("メールアドレスを入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(trimmed);

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSent(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "リセットリンクの送信に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  function handleBackToLogin() {
    router.replace("/(auth)/login");
  }

  // ── Success state ──
  if (sent) {
    return (
      <View style={styles.screen}>
        <View style={styles.successContainer}>
          <View style={styles.successIconWrap}>
            <Icon source="email-check-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.successTitle}>メールを送信しました</Text>
          <Text style={styles.successSubtitle}>
            メールに記載されたリンクからパスワードをリセットしてください。
          </Text>
          <Pressable onPress={handleBackToLogin} style={styles.backLink}>
            <Text style={styles.backLinkText}>ログインに戻る</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Main form ──
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branded header (matching login) */}
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>Ledra</Text>
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          <Text style={styles.title}>パスワードをリセット</Text>
          <Text style={styles.description}>
            登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
          </Text>

          <TextInput
            label="メールアドレス"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError("");
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            style={styles.input}
            disabled={loading}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}

          <LedraButton
            onPress={handleReset}
            loading={loading}
            disabled={loading || !email.trim()}
          >
            リセットリンクを送信
          </LedraButton>

          <Pressable
            onPress={handleBackToLogin}
            disabled={loading}
            style={styles.bottomLink}
          >
            <Text style={styles.bottomLinkText}>
              ログインに戻る
            </Text>
          </Pressable>
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

  // Branded header (same pattern as login)
  brandHeader: {
    backgroundColor: colors.primary,
    paddingTop: 80,
    paddingBottom: spacing["4xl"],
    paddingHorizontal: spacing["2xl"],
    alignItems: "center",
  },
  brandTitle: {
    ...typography.hero,
    fontSize: 36,
    color: colors.textOnPrimary,
    letterSpacing: 2,
  },

  // Form card
  formCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing["2xl"],
    paddingTop: spacing["3xl"],
    paddingBottom: spacing["4xl"],
    flex: 1,
    gap: spacing.md,
  },
  title: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.surface,
  },

  // Bottom link
  bottomLink: {
    alignItems: "center",
    minHeight: sizing.touchTarget,
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  bottomLinkText: {
    ...typography.bodySmall,
    color: colors.primary,
  },

  // Success state
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
  },
  successIconWrap: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
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
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing["2xl"],
  },
  backLink: {
    minHeight: sizing.touchTarget,
    justifyContent: "center",
  },
  backLinkText: {
    ...typography.label,
    color: colors.primary,
  },
});
