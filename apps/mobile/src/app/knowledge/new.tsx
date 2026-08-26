import { useState } from "react";
import { View, StyleSheet, ScrollView, Pressable } from "react-native";
import { Text, TextInput, Snackbar, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

const CATEGORIES = [
  { value: "general", label: "全般" },
  { value: "ppf", label: "PPF" },
  { value: "coating", label: "コーティング" },
  { value: "body_repair", label: "ボディリペア" },
  { value: "maintenance", label: "メンテナンス" },
];

const LEVELS = [
  { value: "intro", label: "入門" },
  { value: "basic", label: "基本" },
  { value: "standard", label: "標準" },
  { value: "pro", label: "上級" },
];

/**
 * ナレッジ投稿。
 *
 * 公開すると自店舗だけでなく **他店舗からも読める**（academy_lessons の
 * status='published' は全認証ユーザーに開かれている）ため、公開範囲は
 * 投稿者が明示的に選ぶ。既定は下書き。
 * 権限判定（admin 以上）はサーバー側 /api/mobile/academy/lessons が持つ。
 */
export default function KnowledgeNewScreen() {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [level, setLevel] = useState("basic");
  const [tagsText, setTagsText] = useState("");
  const [publish, setPublish] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const canSubmit = title.trim().length >= 3 && body.trim().length >= 10;

  async function submit() {
    setSaving(true);
    try {
      await mobileApi("/academy/lessons", {
        method: "POST",
        body: {
          title: title.trim(),
          summary: summary.trim() || undefined,
          body: body.trim(),
          category,
          level,
          tags: tagsText
            .split(/[,、\s]+/)
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 10),
          status: publish ? "published" : "draft",
        },
      });
      queryClient.invalidateQueries({ queryKey: ["knowledge-lessons"] });
      setSnackbar(publish ? "公開しました" : "下書きとして保存しました");
      setTimeout(() => router.back(), 1000);
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.heading}>タイトル</Text>
          <TextInput
            mode="outlined"
            value={title}
            onChangeText={setTitle}
            placeholder="例: 30アルファードの前後ドラレコ取付"
            style={styles.input}
          />
          <Text style={styles.heading}>概要（任意）</Text>
          <TextInput
            mode="outlined"
            value={summary}
            onChangeText={setSummary}
            placeholder="一覧に出る短い説明"
            style={styles.input}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>本文</Text>
          <Text style={styles.hint}>
            作業の勘所・つまずいた点・注意点を、次に同じ作業をする人が読んで分かる形で
          </Text>
          <TextInput
            mode="outlined"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={10}
            placeholder="例: 左Aピラー内の配線でクリップ破損に注意。リアゲート蛇腹通しに時間がかかる。"
            style={[styles.input, styles.bodyInput]}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>カテゴリ</Text>
          <SegmentedControl segments={CATEGORIES} value={category} onChange={setCategory} />
          <Text style={styles.heading}>レベル</Text>
          <SegmentedControl segments={LEVELS} value={level} onChange={setLevel} />
          <Text style={styles.heading}>タグ（任意）</Text>
          <TextInput
            mode="outlined"
            value={tagsText}
            onChangeText={setTagsText}
            placeholder="スペースまたはカンマ区切り"
            style={styles.input}
            dense
          />
        </View>

        {/* 公開範囲は取り違えると他社に出るので、選択と結果を明示する */}
        <View style={styles.card}>
          <Text style={styles.heading}>公開範囲</Text>
          <SegmentedControl
            segments={[
              { value: "draft", label: "下書き" },
              { value: "published", label: "公開する" },
            ]}
            value={publish ? "published" : "draft"}
            onChange={(v) => setPublish(v === "published")}
          />
          <View style={[styles.notice, publish && styles.noticeWarn]}>
            <Icon
              source={publish ? "earth" : "lock-outline"}
              size={18}
              color={publish ? colors.warningDark : colors.textSecondary}
            />
            <Text style={[styles.noticeText, publish && styles.noticeTextWarn]}>
              {publish
                ? "他店舗のスタッフからも読めるようになります。顧客名・車両番号など特定につながる情報は書かないでください。"
                : "自店舗だけに保存されます。あとから公開できます。"}
            </Text>
          </View>
        </View>

        <View style={styles.submitArea}>
          <LedraButton
            icon={publish ? "earth" : "content-save-outline"}
            onPress={submit}
            loading={saving}
            disabled={!canSubmit || saving}
          >
            {publish ? "公開する" : "下書きを保存"}
          </LedraButton>
          <Pressable onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </Pressable>
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
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  hint: { ...typography.meta, color: colors.textSecondary, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surface },
  bodyInput: { minHeight: 180 },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
  },
  noticeWarn: { backgroundColor: colors.warningLight },
  noticeText: { ...typography.meta, color: colors.textSecondary, flex: 1 },
  noticeTextWarn: { color: colors.warningDark },
  submitArea: { padding: spacing.lg, gap: spacing.md },
  cancel: { alignItems: "center", paddingVertical: spacing.sm },
  cancelText: { ...typography.label, color: colors.textSecondary },
});
