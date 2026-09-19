import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Alert, Linking } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  content_url: string | null;
  sort_order: number;
  is_required: boolean;
  completion: { id: string; completed_at: string } | null;
};

export default function TrainingScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [completing, setCompleting] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ft-training", user?.tenantId, projectId],
    queryFn: () =>
      mobileApi<{ modules: TrainingModule[] }>(`/field-test/training?project_id=${projectId}`),
    enabled: !!user?.tenantId && !!projectId,
  });

  const modules = data?.modules ?? [];
  const completedCount = modules.filter((m) => m.completion).length;
  const requiredCount = modules.filter((m) => m.is_required).length;
  const requiredCompleted = modules.filter((m) => m.is_required && m.completion).length;

  const handleComplete = useCallback(
    async (moduleId: string) => {
      setCompleting(moduleId);
      try {
        await mobileApi("/field-test/training/completions", {
          method: "POST",
          body: { module_id: moduleId },
        });
        queryClient.invalidateQueries({ queryKey: ["ft-training"] });
        Alert.alert("完了", "受講完了を記録しました");
      } catch (e: unknown) {
        Alert.alert("エラー", e instanceof Error ? e.message : "記録に失敗しました");
      } finally {
        setCompleting(null);
      }
    },
    [queryClient],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={modules}
        keyExtractor={(m) => m.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          modules.length > 0 ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                受講済: {completedCount}/{modules.length}
              </Text>
              {requiredCount > 0 && (
                <Text style={styles.summaryText}>
                  必須: {requiredCompleted}/{requiredCount}
                </Text>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.completion && styles.cardCompleted]}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Icon
                  source={item.completion ? "check-circle" : "school-outline"}
                  size={22}
                  color={item.completion ? colors.success : colors.primary}
                />
              </View>
              <View style={styles.cardText}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.is_required && (
                    <View style={styles.requiredBadge}>
                      <Text style={styles.requiredText}>必須</Text>
                    </View>
                  )}
                </View>
                {item.description && (
                  <Text style={styles.desc} numberOfLines={3}>
                    {item.description}
                  </Text>
                )}
              </View>
            </View>

            {item.content_url && (
              <Pressable
                style={styles.materialLink}
                onPress={() => Linking.openURL(item.content_url!)}
              >
                <Icon source="open-in-new" size={14} color={colors.primary} />
                <Text style={styles.materialText}>教材を開く</Text>
              </Pressable>
            )}

            <View style={styles.actionRow}>
              {item.completion ? (
                <View style={styles.completedBadge}>
                  <Icon source="check-circle" size={16} color={colors.success} />
                  <Text style={styles.completedText}>
                    受講済 ({item.completion.completed_at.slice(0, 10)})
                  </Text>
                </View>
              ) : (
                <Button
                  mode="contained"
                  onPress={() => handleComplete(item.id)}
                  loading={completing === item.id}
                  disabled={completing !== null}
                  style={styles.completeBtn}
                  labelStyle={styles.completeBtnLabel}
                >
                  受講完了
                </Button>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="school-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>教育モジュールはありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  summary: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  summaryText: { ...typography.meta, color: colors.textSecondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardCompleted: {
    borderWidth: 1,
    borderColor: colors.success + "40",
    backgroundColor: colors.success + "08",
  },
  cardHeader: { flexDirection: "row", gap: spacing.md },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { ...typography.titleSmall, color: colors.textPrimary, flexShrink: 1 },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  requiredBadge: {
    backgroundColor: "#FEE2E2",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  requiredText: { fontSize: 10, fontWeight: "600", color: "#B91C1C" },
  materialLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
    marginLeft: 52,
  },
  materialText: { ...typography.meta, color: colors.primary },
  actionRow: { marginTop: spacing.md, marginLeft: 52 },
  completedBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  completedText: { ...typography.meta, color: colors.success },
  completeBtn: { borderRadius: radius.md, alignSelf: "flex-start" },
  completeBtnLabel: { fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
});
