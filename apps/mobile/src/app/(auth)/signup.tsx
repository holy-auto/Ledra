import { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Text, TextInput, Button, HelperText } from "react-native-paper";
import { router } from "expo-router";

import { signIn, fetchUserProfile } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

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
 * mobileApi（Bearer 必須）ではなく素の fetch で叩く。成功後はそのまま
 * signInWithPassword でサインインし、店舗選択へ進む。
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

      // 登録成功 → そのままサインイン（アプリ内で完結）
      await signIn(email.trim(), password);
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
      router.replace("/(auth)/select-store");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "登録に失敗しました"
      );
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
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="headlineLarge" style={styles.title}>
            Ledra
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            新規登録（無料）
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="店舗名"
            value={shopName}
            onChangeText={setShopName}
            mode="outlined"
            style={styles.input}
            disabled={loading}
          />
          <TextInput
            label="お名前（任意）"
            value={displayName}
            onChangeText={setDisplayName}
            mode="outlined"
            style={styles.input}
            disabled={loading}
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
          />

          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            登録して始める
          </Button>

          <Button
            mode="text"
            onPress={() => router.replace("/(auth)/login")}
            disabled={loading}
            style={styles.linkButton}
          >
            すでにアカウントをお持ちの方はログイン
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fafafa" },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontWeight: "700",
    color: "#1a1a2e",
    letterSpacing: 2,
  },
  subtitle: {
    marginTop: 8,
    color: "#71717a",
  },
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: "#ffffff",
  },
  button: {
    marginTop: 12,
    borderRadius: 12,
  },
  buttonContent: {
    paddingVertical: 6,
  },
  linkButton: {
    marginTop: 4,
  },
});
