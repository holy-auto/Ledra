import { View, StyleSheet, ScrollView, Linking, Pressable } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Lesson {
  id: string;
  tenant_id: string | null;
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

  const { data, isLoading, isError } = useQuery<Lesson | null>({
    queryKey: ["knowledge-lesson", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select(
          "id, tenant_id, category, level, title, summary, body, video_url, tags, published_at, rating_avg, rating_count",
        )
        .eq("id", id)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Lesson | null;
    },
    enabled: !!id,
  });

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
});
