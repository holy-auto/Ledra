import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type FtProject = {
  id: string;
  name: string;
  description: string | null;
  product_name: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

const STATUS_LABELS: Record<string, { label: string; severity: "info" | "success" | "warning" }> = {
  active: { label: "実施中", severity: "success" },
  recruiting: { label: "募集中", severity: "info" },
  completed: { label: "完了", severity: "warning" },
  draft: { label: "下書き", severity: "warning" },
};

export default function FieldTestProjectsScreen() {
  const { user } = useAuthStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ft-projects", user?.tenantId],
    queryFn: () => mobileApi<{ projects: FtProject[] }>("/field-test/projects"),
    enabled: !!user?.tenantId,
  });

  const projects = data?.projects ?? [];

  return (
    <View style={styles.container}>
      <FlatList
        data={projects}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cfg = STATUS_LABELS[item.status] ?? { label: item.status, severity: "info" as const };
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/field-test/${item.id}`)}
              accessibilityRole="button"
            >
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Icon source="flask-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
                  {item.product_name && (
                    <Text style={styles.subtitle} numberOfLines={1}>{item.product_name}</Text>
                  )}
                </View>
                <StatusBadge label={cfg.label} severity={cfg.severity} />
              </View>
              {item.description && (
                <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              )}
              {(item.starts_at || item.ends_at) && (
                <Text style={styles.dates}>
                  {item.starts_at ?? "?"} 〜 {item.ends_at ?? "?"}
                </Text>
              )}
              <View style={styles.chevron}>
                <Icon source="chevron-right" size={20} color={colors.textTertiary} />
              </View>
            </Pressable>
          );
        }}
        ListHeaderComponent={
          <View style={styles.headerLinks}>
            <Pressable
              style={styles.recruitmentLink}
              onPress={() => router.push("/field-test/recruitments")}
              accessibilityRole="button"
            >
              <Icon source="bullhorn-outline" size={20} color={colors.primary} />
              <Text style={styles.recruitmentLinkText}>募集一覧を見る</Text>
              <Icon source="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              style={styles.recruitmentLink}
              onPress={() => router.push("/field-test/applications")}
              accessibilityRole="button"
            >
              <Icon source="file-document-outline" size={20} color={colors.primary} />
              <Text style={styles.recruitmentLinkText}>応募状況を見る</Text>
              <Icon source="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
            <Pressable
              style={styles.recruitmentLink}
              onPress={() => router.push("/field-test/workshop-profile")}
              accessibilityRole="button"
            >
              <Icon source="tools" size={20} color={colors.primary} />
              <Text style={styles.recruitmentLinkText}>工場設備プロフィール</Text>
              <Icon source="chevron-right" size={18} color={colors.textTertiary} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="flask-empty-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>参加中のプロジェクトはありません</Text>
            <Text style={styles.emptyDesc}>メーカーからの案件割当があるとここに表示されます</Text>
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
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
    position: "relative",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.md,
    backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center",
  },
  cardText: { flex: 1 },
  title: { ...typography.titleSmall, color: colors.textPrimary },
  subtitle: { ...typography.meta, color: colors.textSecondary, marginTop: 2 },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm, marginLeft: 52 },
  dates: { ...typography.meta, color: colors.textTertiary, marginTop: spacing.xs, marginLeft: 52 },
  chevron: { position: "absolute", right: spacing.lg, top: "50%", marginTop: -10 },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
  emptyDesc: { ...typography.bodySmall, color: colors.textSecondary },
  headerLinks: { gap: spacing.sm, marginBottom: spacing.sm },
  recruitmentLink: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.primaryLight, borderRadius: radius.card,
    padding: spacing.md,
  },
  recruitmentLinkText: { ...typography.label, color: colors.primary, flex: 1 },
});
