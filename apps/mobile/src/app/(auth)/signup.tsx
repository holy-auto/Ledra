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

import { signIn, fetchUserProfile } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, sizing } from "@/constants/tokens";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

/**
 * アプリ内サインアップ（新規施工店登録）。
 *
 * Apple Tap to Pay 要件 2.x:
 *   完全アプリ内デジタルオンボーディング（アカウント作成→利用開始が
 *   アプリ内で完結、平均15分以内）を満たすための画面。
 *
 * バックエンドは既存の Web と共通の POST /api/signup を再利用する
 * （テナント + owner ユーザーを原子的に作成）。認証前エンドポイントなので
 * mobileApi（Bearer 必須）ではなく素の fetch で叩く。
 *
 * B-H3 是正 (2026-09-08): /api/signup は email_confirm: false でユーザーを
 * 作成し、確認メール（マジックリンク）を送るようになった（以前はここで
 * signInWithPassword が常に成功し、被害者のメールアドレスでもテナントに
 * 即ログインできてしまっていた）。そのため本画面の「登録直後に即サインイン」
 * は通常失敗し、以下の「確認メールを送信しました」画面に落ちる。
 *
 * これは上記 Apple 要件（完全アプリ内・平均15分以内）と衝突する
 * （メールアプリへ離脱するステップが増える）。恒久対応は
 * docs/context/OPEN_QUESTIONS.md を参照 — アプリ内 OTP（/auth/otp/*）を
 * 本人確認そのものに昇格させ、確認前はテナント権限を持たないセッションで
 * 止める設計が候補（現状の /auth/otp/* は認証後の飾りで強制力が無い）。
 */
export default function SignupScreen() {
  const [shopName, setShopName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { setUser } = useAuthStore();

  async function handleSignup() {
    // 入力ガード（サーバー側 Zod と同等の最小チェックをクライアントでも）
    if (!shopName.trim()) {
      setError("店舗名を入力してください");
      return;
    }
    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上で入力してください");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE_URL}/api/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: shopName.trim(),
          display_name: displayName.trim() || null,
          email: email.trim(),
          password,
          contact_phone: contactPhone.trim() || null,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };

      if (!res.ok) {
        setError(data.message || "登録に失敗しました");
        setLoading(false);
        return;
      }

      // 登録成功 → サインインを試みる。メール確認前は失敗するのが通常経路
      // （B-H3 是正）。ここだけ個別に catch し、確認メール送信済み画面へ。
      // コードレビュー指摘 (2026-09-08): 理由を問わず全ての失敗を「確認メール
      // 送信済み」として握りつぶすと、ネットワーク断やレート制限など無関係の
      // 失敗まで誤案内してしまう。Supabase の email_not_confirmed コードの
      // ときだけ確認メール画面へ、それ以外はエラー表示する。
      try {
        await signIn(email.trim(), password);
      } catch (err: unknown) {
        const code = (err as { code?: string } | null)?.code;
        if (code === "email_not_confirmed") {
          setEmailSent(true);
          setLoading(false);
          return;
        }
        setError(
          err instanceof Error ? err.message : "ログインに失敗しました"
        );
        setLoading(false);
        return;
      }
      const profile = await fetchUserProfile();
      if (!profile) {
        // 稀: 直後のメンバーシップ読み取り失敗。ログインからやり直してもらう。
        setError(
          "登録は完了しましたが、プロフィールの取得に失敗しました。ログインし直してください。"
        );
        setLoading(false);
        return;
      }

      setUser(profile);
      // メール確認（OTP）を通す。verify-otp は成功後に
      // /(auth)/select-store?fromSignup=1 へ送る（verify-otp.tsx:128）ので、
      // そこから先の導線（店舗選択 → 生体認証 → オンボーディング）は変わらない。
      router.replace({
        pathname: "/(auth)/verify-otp",
        params: { email: email.trim(), fromSignup: "1" },
      });
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "登録に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
      <View style={[styles.flex, styles.emailSentContainer]}>
        <Text style={styles.brandTitle}>確認メールを送信しました</Text>
        <Text style={styles.emailSentBody}>
          {email.trim()} 宛に確認リンクを送信しました。メール内のリンクを
          開いてご確認のうえ、ログインしてください。
        </Text>
        <LedraButton onPress={() => router.replace("/(auth)/login")}>
          ログイン画面へ
        </LedraButton>
      </View>
    );
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
            アカウントを作成してください
          </Text>
        </View>

        {/* Form card */}
        <View style={styles.formCard}>
          <TextInput
            label="店舗名"
            value={shopName}
            onChangeText={setShopName}
            mode="outlined"
            style={styles.input}
            disabled={loading}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />
          <TextInput
            label="お名前（任意）"
            value={displayName}
            onChangeText={setDisplayName}
            mode="outlined"
            style={styles.input}
            disabled={loading}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />
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
            label="パスワード（8文字以上）"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
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
          <TextInput
            label="電話番号（任意）"
            value={contactPhone}
            onChangeText={setContactPhone}
            keyboardType="phone-pad"
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
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
          >
            登録して始める
          </LedraButton>

          {/* Login link */}
          <Pressable
            onPress={() => router.replace("/(auth)/login")}
            disabled={loading}
            style={styles.bottomLink}
          >
            <Text style={styles.bottomLinkText}>
              すでにアカウントをお持ちの方は{" "}
              <Text style={styles.bottomLinkBold}>ログイン</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  emailSentContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing["2xl"],
    gap: spacing.lg,
  },
  emailSentBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
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
