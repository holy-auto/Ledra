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

import { signIn } from "@/lib/auth";
import { fetchUserProfile } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuthStore();

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

      setUser(profile);
      router.replace("/(auth)/select-store");
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
            CARTRUST
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
});
