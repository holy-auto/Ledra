import { useState } from "react";
import { View, StyleSheet, ScrollView, Linking, Pressable, Alert } from "react-native";
import { Text, ActivityIndicator, Icon, Snackbar } from "react-native-paper";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Lesson {
  id: string;
  tenant_id: string | null;
  author_user_id: string | null;
  status: string;
  category: string;
  level: string;
  title: string;
  summary: string | null;
  body: string;
  video_url: string | null;
  tags: string[];
  published_at: string | null;
  rating_avg: number;
  rating_count: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  general: "全般",
  ppf: "PPF",
  coating: "コーティング",
  body_repair: "ボディリペア",
  maintenance: "メンテナンス",
};

const LEVEL_LABEL: Record<string, string> = {
  intro: "入門",
  basic: "基本",
  standard: "標準",
  pro: "上級",
};

export default function KnowledgeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState("");

  const { data, isLoading, isError } = useQuery<Lesson | null>({
    queryKey: ["knowledge-lesson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select(
          "id, tenant_id, author_user_id, status, category, level, title, summary, body, video_url, tags, published_at, rating_avg, rating_count",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Lesson | null;
    },
    enabled: !!id,
  });

  // 取り下げ・再公開・削除は作者本人のみ（サーバー側 canModifyLesson が正）
  const isAuthor = !!user?.id && data?.author_user_id === user.id;

  async function changeStatus(next: "draft" | "published") {
    setBusy(true);
    try {
      await mobileApi(`/academy/lessons/${id}`, {
        method: "PATCH",
        body: { status: next },
      });
      await queryClient.invalidateQueries({ queryKey: ["knowledge-lesson", id] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-lessons"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-mine"] });
      setSnackbar(next === "draft" ? "公開を取り消しました" : "公開しました");
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : "変更に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "この投稿を削除しますか？",
      "削除すると元に戻せません。公開を止めるだけなら「公開を取り消す」を使ってください。",
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除する",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await mobileApi(`/academy/lessons/${id}`, { method: "DELETE" });
              queryClient.invalidateQueries({ queryKey: ["knowledge-lessons"] });
              queryClient.invalidateQueries({ queryKey: ["knowledge-mine"] });
              router.back();
            } catch (e) {
              setSnackbar(e instanceof Error ? e.message : "削除に失敗しました");
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <EmptyState
        icon="book-remove-outline"
        title="ナレッジが見つかりません"
        description="公開が取り消された可能性があります"
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: data.title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <StatusBadge
              label={data.tenant_id ? "他店舗の知見" : "Ledra 公式"}
              severity={data.tenant_id ? "info" : "success"}
              compact
            />
            <Text style={styles.meta}>
              {CATEGORY_LABEL[data.category] ?? data.category} ・{" "}
              {LEVEL_LABEL[data.level] ?? data.level}
            </Text>
          </View>
          <Text style={styles.title}>{data.title}</Text>
          {data.summary && <Text style={styles.summary}>{data.summary}</Text>}
          {data.rating_count > 0 && (
            <View style={styles.ratingRow}>
              <Icon source="star" size={14} color={colors.warning} />
              <Text style={styles.meta}>
                {data.rating_avg.toFixed(1)}（{data.rating_count}件）
              </Text>
            </View>
          )}
        </View>

        {data.video_url && (
          <Pressable
            style={styles.card}
            onPress={() => void Linking.openURL(data.video_url!)}
            accessibilityRole="button"
            accessibilityLabel="動画を再生"
          >
            <View style={styles.videoRow}>
              <Icon source="play-circle-outline" size={24} color={colors.primary} />
              <Text style={styles.videoText}>動画を見る</Text>
            </View>
          </Pressable>
        )}

        {!!data.body && (
          <View style={styles.card}>
            <Text style={styles.body}>{data.body}</Text>
          </View>
        )}

        {isAuthor && (
          <View style={styles.card}>
            <Text style={styles.ownerHeading}>この投稿の管理</Text>
            <Text style={styles.meta}>
              {data.status === "published"
                ? "現在、他店舗のスタッフからも読める状態です"
                : "現在は自分と自店舗だけが見られる状態です"}
            </Text>
            <LedraButton
              variant={data.status === "published" ? "outline" : "primary"}
              icon={data.status === "published" ? "eye-off-outline" : "earth"}
              loading={busy}
              disabled={busy}
              onPress={() =>
                changeStatus(data.status === "published" ? "draft" : "published")
              }
            >
              {data.status === "published" ? "公開を取り消す" : "公開する"}
            </LedraButton>
            <Pressable onPress={confirmDelete} disabled={busy} style={styles.deleteRow}>
              <Icon source="trash-can-outline" size={18} color={colors.danger} />
              <Text style={styles.deleteText}>この投稿を削除する</Text>
            </Pressable>
          </View>
        )}

        {data.tags.length > 0 && (
          <View style={styles.tagWrap}>
            {data.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </View>
            ))}
          </View>
        )}

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
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: { ...typography.titleMedium, color: colors.textPrimary },
  summary: { ...typography.bodySmall, color: colors.textSecondary },
  body: { ...typography.body, color: colors.textPrimary },
  meta: { ...typography.meta, color: colors.textTertiary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  videoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  videoText: { ...typography.label, color: colors.primary },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
  },
  tagText: { ...typography.meta, color: colors.textSecondary },
  ownerHeading: { ...typography.label, color: colors.textPrimary },
  deleteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  deleteText: { ...typography.label, color: colors.danger },
});
