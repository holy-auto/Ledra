import { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { Text, TextInput, HelperText } from "react-native-paper";
import { router } from "expo-router";

import { fetchUserProfile, resolveDefaultStore, signIn } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser, setSelectedStore } = useAuthStore();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError("メールアドレスとパスワードを入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await signIn(email.trim(), password);
      const profile = await fetchUserProfile();

      if (!profile) {
        setError("テナント情報が見つかりません");
        setLoading(false);
        return;
      }

      // 遷移先を決める前に店舗を確定させる。ここで解決しておかないと
      // select-store に飛ばされ、そこでの店舗フェッチを待って /(tabs) へ
      // 跳ね返る＝ログインのたびに画面が2回変わる。
      // 解決に失敗しても null になるだけで、ログイン自体は成功させる。
      const store = profile.tenantId
        ? await resolveDefaultStore(profile.tenantId)
        : null;

      // 店舗を先に入れる。setUser が isAuthenticated を立てるので、
      // 逆順だと (tabs)/_layout が「認証済みだが店舗なし」を見て
      // select-store へ飛ばす。
      setSelectedStore(store);
      setUser(profile);

      // 行き先は明示的に分ける。常に /(tabs) へ送って (tabs)/_layout の
      // ゲートに任せると、0店舗・複数店舗のユーザーに1フレーム分の
      // 余計な画面が挟まる（いま消そうとしているものと同種）。
      router.replace(store ? "/(tabs)" : "/(auth)/select-store");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "ログインに失敗しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branded header */}
        <View style={styles.brandHeader}>
          <Text style={styles.brandTitle}>Ledra</Text>
          <Text style={styles.brandSubtitle}>
            アカウントにログインしてください
          </Text>
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          <TextInput
            label="メールアドレス"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            style={styles.input}
            disabled={loading}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            label="パスワード"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            disabled={loading}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off" : "eye"}
                onPress={() => setShowPassword(!showPassword)}
              />
            }
          />

          <Pressable
            onPress={() => router.push("/(auth)/forgot-password")}
            style={styles.forgotLink}
          >
            <Text style={styles.forgotText}>パスワードをお忘れの方</Text>
          </Pressable>

          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}

          <LedraButton
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
          >
            ログイン
          </LedraButton>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>または</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google sign-in (visual only) */}
          <LedraButton
            variant="outline"
            icon="google"
            onPress={() => {
              // ponytail: Google sign-in not implemented yet
            }}
          >
            Googleでログイン
          </LedraButton>

          {/* Sign-up link */}
          <Pressable
            onPress={() => router.push("/(auth)/signup")}
            disabled={loading}
            style={styles.bottomLink}
          >
            <Text style={styles.bottomLinkText}>
              アカウントをお持ちでない方は{" "}
              <Text style={styles.bottomLinkBold}>新規登録</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
  },
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
  brandSubtitle: {
    ...typography.body,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: spacing.sm,
  },
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
  input: {
    backgroundColor: colors.surface,
  },
  forgotLink: {
    alignSelf: "flex-end",
  },
  forgotText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.sm,
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  bottomLink: {
    alignItems: "center",
    marginTop: spacing.lg,
    minHeight: sizing.touchTarget,
    justifyContent: "center",
  },
  bottomLinkText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bottomLinkBold: {
    ...typography.label,
    color: colors.primary,
  },
});
