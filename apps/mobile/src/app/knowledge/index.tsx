import { useCallback, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
} from "react-native";
import { Text, TextInput, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { SegmentedControl, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/**
 * ナレッジ。アプリを切り替えずに現場で参照できるようにするための画面。
 *
 * - 共有: academy_lessons の published。RLS が status='published' を全認証ユーザーに
 *   開いているので、運営コンテンツと **他店舗が投稿したもの** が横断で読める。
 * - 自店舗: tenant_field_knowledge。自テナントのみ（RLS）。施工の勘所・車種別メモ。
 */

type Scope = "shared" | "own";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "shared", label: "共有ナレッジ" },
  { value: "own", label: "自店舗" },
];

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

interface Lesson {
  id: string;
  tenant_id: string | null;
  category: string;
  level: string;
  title: string;
  summary: string | null;
  tags: string[];
  published_at: string | null;
  rating_avg: number;
  rating_count: number;
}

interface FieldNote {
  id: string;
  title: string;
  content: string;
  vehicle_model: string | null;
  tags: string[];
  created_at: string;
}

export default function KnowledgeScreen() {
  const { user } = useAuthStore();
  const [scope, setScope] = useState<Scope>("shared");
  const [search, setSearch] = useState("");

  const lessons = useQuery<Lesson[]>({
    queryKey: ["knowledge-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select(
          "id, tenant_id, category, level, title, summary, tags, published_at, rating_avg, rating_count",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lesson[];
    },
    enabled: scope === "shared",
  });

  const notes = useQuery<FieldNote[]>({
    queryKey: ["knowledge-field", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_field_knowledge")
        .select("id, title, content, vehicle_model, tags, created_at")
        .eq("tenant_id", user!.tenantId)
        .eq("enabled", true)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as FieldNote[];
    },
    enabled: scope === "own" && !!user?.tenantId,
  });

  const q = search.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    !q || fields.some((f) => (f ?? "").toLowerCase().includes(q));

  const filteredLessons = (lessons.data ?? []).filter((l) =>
    matches(l.title, l.summary, l.tags.join(" "), CATEGORY_LABEL[l.category]),
  );
  const filteredNotes = (notes.data ?? []).filter((n) =>
    matches(n.title, n.content, n.vehicle_model, n.tags.join(" ")),
  );

  const active = scope === "shared" ? lessons : notes;
  const onRefresh = useCallback(() => void active.refetch(), [active]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <SegmentedControl segments={SCOPES} value={scope} onChange={setScope} />
        <TextInput
          mode="outlined"
          placeholder="キーワードで検索"
          value={search}
          onChangeText={setSearch}
          left={<TextInput.Icon icon="magnify" />}
          right={
            search ? (
              <TextInput.Icon icon="close" onPress={() => setSearch("")} />
            ) : undefined
          }
          style={styles.search}
          dense
        />
      </View>

      {scope === "shared" ? (
        <FlatList
          data={filteredLessons}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={lessons.isFetching} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/knowledge/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View style={styles.cardTop}>
                <StatusBadge
                  label={item.tenant_id ? "他店舗の知見" : "Ledra 公式"}
                  severity={item.tenant_id ? "info" : "success"}
                  compact
                />
                <Text style={styles.meta}>
                  {CATEGORY_LABEL[item.category] ?? item.category} ・{" "}
                  {LEVEL_LABEL[item.level] ?? item.level}
                </Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              {item.summary && (
                <Text style={styles.summary} numberOfLines={2}>
                  {item.summary}
                </Text>
              )}
              {item.tags.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagRow}
                >
                  {item.tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              {item.rating_count > 0 && (
                <View style={styles.ratingRow}>
                  <Icon source="star" size={14} color={colors.warning} />
                  <Text style={styles.meta}>
                    {item.rating_avg.toFixed(1)}（{item.rating_count}件）
                  </Text>
                </View>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="book-open-variant"
              title={q ? "該当するナレッジがありません" : "共有ナレッジはまだありません"}
              description="Ledra 公式と他店舗が公開した知見がここに並びます"
            />
          }
        />
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={notes.isFetching} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.vehicle_model && (
                <Text style={styles.meta}>{item.vehicle_model}</Text>
              )}
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.summary}>{item.content}</Text>
              {item.tags.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagRow}
                >
                  {item.tags.map((t) => (
                    <View key={t} style={styles.tag}>
                      <Text style={styles.tagText}>{t}</Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="lightbulb-on-outline"
              title={q ? "該当するメモがありません" : "自店舗のナレッジはまだありません"}
              description="施工の勘所や車種別メモは Web の管理画面から登録できます"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  search: { backgroundColor: colors.surface },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.card,
  },
  cardPressed: { opacity: 0.7 },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  title: { ...typography.titleSmall, color: colors.textPrimary },
  summary: { ...typography.bodySmall, color: colors.textSecondary },
  meta: { ...typography.meta, color: colors.textTertiary },
  tagRow: { gap: spacing.xs, paddingTop: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
  },
  tagText: { ...typography.meta, color: colors.textSecondary },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
