import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { Text, TextInput, Snackbar } from "react-native-paper";
import { router } from "expo-router";

import { useAuthStore } from "@/stores/authStore";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

const WEB_BASE = process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.ledra.co.jp";

const CATEGORIES = [
  { value: "使い方", label: "使い方" },
  { value: "不具合", label: "不具合" },
  { value: "要望", label: "要望" },
  { value: "その他", label: "その他" },
];

/**
 * お問い合わせ。既存の Web API（/api/contact）へそのまま送るので、
 * 受信側（メール + Slack 通知）の導線は Web と共通。
 * ブラウザに飛ばさずアプリ内で完結させる。
 */
export default function ContactScreen() {
  const { user, selectedStore } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [category, setCategory] = useState("使い方");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && message.trim().length > 0;

  async function submit() {
    setSending(true);
    try {
      const res = await fetch(`${WEB_BASE}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          company: selectedStore?.name ?? "",
          category,
          // 問い合わせ対応で端末側の文脈が分かるよう、アプリ経由であることを添える
          message: `${message.trim()}\n\n---\nLedra モバイルアプリから送信`,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "送信に失敗しました");
      }
      setSnackbar("送信しました。折り返しご連絡します。");
      setMessage("");
      setTimeout(() => router.back(), 1200);
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.heading}>お名前</Text>
          <TextInput
            mode="outlined"
            value={name}
            onChangeText={setName}
            placeholder="山田 太郎"
            style={styles.input}
          />
          <Text style={styles.heading}>返信先メールアドレス</Text>
          <TextInput
            mode="outlined"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>種別</Text>
          <SegmentedControl
            segments={CATEGORIES}
            value={category}
            onChange={setCategory}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>お問い合わせ内容</Text>
          <TextInput
            mode="outlined"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={8}
            placeholder="できるだけ具体的にご記入ください"
            style={[styles.input, styles.messageInput]}
          />
        </View>

        <View style={styles.submitArea}>
          <LedraButton
            icon="send"
            onPress={submit}
            loading={sending}
            disabled={!canSubmit || sending}
          >
            送信する
          </LedraButton>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  input: { backgroundColor: colors.surface },
  messageInput: { minHeight: 140 },
  submitArea: { padding: spacing.lg },
});
