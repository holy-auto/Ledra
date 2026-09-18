import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type FtJob = {
  id: string;
  job_code: string | null;
  title: string;
  status: string;
  assigned_at: string;
  completed_at: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; severity: "info" | "success" | "warning" }> = {
  assigned: { label: "割当済", severity: "info" },
  in_progress: { label: "施工中", severity: "warning" },
  evidence_submitted: { label: "証拠提出済", severity: "info" },
  inspection: { label: "検査中", severity: "warning" },
  completed: { label: "完了", severity: "success" },
  rejected: { label: "差戻し", severity: "warning" },
};

export default function FieldTestJobsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { user } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ft-jobs", user?.tenantId, projectId],
    queryFn: () => mobileApi<{ jobs: FtJob[] }>(`/field-test/jobs?project_id=${projectId}`),
    enabled: !!user?.tenantId && !!projectId,
  });

  const jobs = data?.jobs ?? [];

  return (
    <View style={styles.container}>
      <FlatList
        data={jobs}
        keyExtractor={(j) => j.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] ?? { label: item.status, severity: "info" as const };
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/field-test/${projectId}/${item.id}`)}
              accessibilityRole="button"
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardText}>
                  {item.job_code && <Text style={styles.code}>{item.job_code}</Text>}
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                </View>
                <StatusBadge label={cfg.label} severity={cfg.severity} />
              </View>
              <View style={styles.meta}>
                <Icon source="calendar-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.metaText}>{item.assigned_at?.slice(0, 10) ?? "-"}</Text>
                {item.completed_at && (
                  <>
                    <Icon source="check-circle-outline" size={14} color={colors.success} />
                    <Text style={styles.metaText}>{item.completed_at.slice(0, 10)}</Text>
                  </>
                )}
              </View>
              <View style={styles.chevron}>
                <Icon source="chevron-right" size={20} color={colors.textTertiary} />
              </View>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.navLinks}>
            <Pressable
              style={styles.navLink}
              onPress={() => router.push(`/field-test/${projectId}/training`)}
              accessibilityRole="button"
            >
              <Icon source="school-outline" size={20} color={colors.primary} />
              <Text style={styles.navLinkText}>教育</Text>
              <Icon source="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              style={styles.navLink}
              onPress={() => router.push(`/field-test/${projectId}/agreements`)}
              accessibilityRole="button"
            >
              <Icon source="file-document-outline" size={20} color={colors.primary} />
              <Text style={styles.navLinkText}>契約</Text>
              <Icon source="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="clipboard-text-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>案件はありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.lg, ...shadows.card, position: "relative",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardText: { flex: 1 },
  code: { ...typography.meta, color: colors.textTertiary, fontFamily: "monospace" },
  title: { ...typography.titleSmall, color: colors.textPrimary },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.sm, paddingRight: spacing["3xl"] },
  metaText: { ...typography.meta, color: colors.textTertiary },
  chevron: { position: "absolute", right: spacing.lg, top: "50%", marginTop: -10 },
  navLinks: { gap: spacing.sm, marginBottom: spacing.md },
  navLink: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.primaryLight, borderRadius: radius.card,
    padding: spacing.md,
  },
  navLinkText: { ...typography.label, color: colors.primary, flex: 1 },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
});
