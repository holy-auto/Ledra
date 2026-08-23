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

import { fetchUserProfile, resolveDefaultStore, signIn } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

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
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="headlineLarge" style={styles.title}>
            Ledra
          </Text>
          <Text variant="bodyLarge" style={styles.subtitle}>
            業務管理アプリ
          </Text>
        </View>

        <View style={styles.form}>
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
            label="パスワード"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
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

          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            ログイン
          </Button>

          <Button
            mode="text"
            onPress={() => router.push("/(auth)/signup")}
            disabled={loading}
            style={styles.linkButton}
          >
            新規登録（施工店の方）はこちら
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
    marginBottom: 48,
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
