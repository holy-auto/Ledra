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

type Scope = "shared" | "own" | "mine";

const SCOPES: { value: Scope; label: string }[] = [
  { value: "shared", label: "共有" },
  { value: "own", label: "自店舗" },
  { value: "mine", label: "自分の投稿" },
];

const STATUS_LABEL: Record<string, { label: string; severity: "success" | "warning" | "neutral" }> = {
  published: { label: "公開中", severity: "success" },
  draft: { label: "下書き", severity: "warning" },
  archived: { label: "アーカイブ", severity: "neutral" },
};

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
  author_user_id: string | null;
  status?: string;
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
  const { user, hasMinRole } = useAuthStore();
  // 投稿できるのは admin 以上（正の判定はサーバー側 /api/mobile/academy/lessons）
  const canPost = hasMinRole("admin");
  const [scope, setScope] = useState<Scope>("shared");
  const [search, setSearch] = useState("");

  const lessons = useQuery<Lesson[]>({
    queryKey: ["knowledge-lessons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select(
          "id, tenant_id, author_user_id, category, level, title, summary, tags, published_at, rating_avg, rating_count",
        )
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lesson[];
    },
    enabled: scope === "shared",
  });

  // 誤って公開したものを取り下げられるよう、下書きも含めて自分の投稿を出す
  const mine = useQuery<Lesson[]>({
    queryKey: ["knowledge-mine", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academy_lessons")
        .select(
          "id, tenant_id, author_user_id, status, category, level, title, summary, tags, published_at, rating_avg, rating_count",
        )
        .eq("author_user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Lesson[];
    },
    enabled: scope === "mine" && !!user?.id,
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
  const filteredMine = (mine.data ?? []).filter((l) =>
    matches(l.title, l.summary, l.tags.join(" ")),
  );

  const active = scope === "shared" ? lessons : scope === "mine" ? mine : notes;
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

      {canPost && scope !== "own" && (
        <Pressable
          style={({ pressed }) => [styles.postButton, pressed && styles.cardPressed]}
          onPress={() => router.push("/knowledge/new")}
          accessibilityRole="button"
          accessibilityLabel="ナレッジを書く"
        >
          <Icon source="pencil-plus-outline" size={20} color={colors.primary} />
          <Text style={styles.postButtonText}>ナレッジを書く</Text>
        </Pressable>
      )}

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
      ) : scope === "mine" ? (
        <FlatList
          data={filteredMine}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={mine.isFetching} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => {
            const st = STATUS_LABEL[item.status ?? "draft"] ?? STATUS_LABEL.draft;
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/knowledge/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}（${st.label}）`}
              >
                <View style={styles.cardTop}>
                  <StatusBadge label={st.label} severity={st.severity} compact />
                  <Text style={styles.meta}>
                    {CATEGORY_LABEL[item.category] ?? item.category}
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
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="pencil-outline"
              title={q ? "該当する投稿がありません" : "まだ投稿がありません"}
              description="公開したものはここから取り消せます"
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
  postButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  postButtonText: { ...typography.label, color: colors.primary },
});
