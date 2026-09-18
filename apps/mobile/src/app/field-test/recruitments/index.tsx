import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable, Alert } from "react-native";
import { Text, Icon, Button, TextInput } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Recruitment = {
  id: string;
  title: string;
  description: string | null;
  required_certifications: string[];
  max_participants: number | null;
  deadline: string | null;
  project_id: string;
};

type Application = {
  id: string;
  status: string;
  recruitment_id: string;
};

export default function RecruitmentsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [applying, setApplying] = useState<string | null>(null);

  const { data: recData, isLoading: recLoading, refetch: refetchRec } = useQuery({
    queryKey: ["ft-recruitments", user?.tenantId],
    queryFn: () => mobileApi<{ recruitments: Recruitment[] }>("/field-test/recruitments"),
    enabled: !!user?.tenantId,
  });

  const { data: appData } = useQuery({
    queryKey: ["ft-applications", user?.tenantId],
    queryFn: () => mobileApi<{ applications: Application[] }>("/field-test/applications"),
    enabled: !!user?.tenantId,
  });

  const recruitments = recData?.recruitments ?? [];
  const appliedIds = new Set((appData?.applications ?? []).map((a) => a.recruitment_id));

  const handleApply = useCallback(async (recruitmentId: string) => {
    setApplying(recruitmentId);
    try {
      await mobileApi("/field-test/applications", {
        method: "POST",
        body: { recruitment_id: recruitmentId },
      });
      queryClient.invalidateQueries({ queryKey: ["ft-applications"] });
      Alert.alert("完了", "応募しました");
    } catch (e: unknown) {
      Alert.alert("エラー", e instanceof Error ? e.message : "応募に失敗しました");
    } finally {
      setApplying(null);
    }
  }, [queryClient]);

  return (
    <View style={styles.container}>
      <FlatList
        data={recruitments}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={recLoading} onRefresh={() => refetchRec()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const applied = appliedIds.has(item.id);
          return (
            <View style={styles.card}>
              <Text style={styles.title}>{item.title}</Text>
              {item.description && (
                <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
              )}
              <View style={styles.metaRow}>
                {item.deadline && (
                  <View style={styles.metaItem}>
                    <Icon source="calendar-clock" size={14} color={colors.textTertiary} />
                    <Text style={styles.metaText}>締切: {item.deadline.slice(0, 10)}</Text>
                  </View>
                )}
                {item.max_participants && (
                  <View style={styles.metaItem}>
                    <Icon source="account-group-outline" size={14} color={colors.textTertiary} />
                    <Text style={styles.metaText}>定員: {item.max_participants}社</Text>
                  </View>
                )}
              </View>
              {item.required_certifications.length > 0 && (
                <View style={styles.certRow}>
                  {item.required_certifications.map((c) => (
                    <View key={c} style={styles.certBadge}>
                      <Text style={styles.certText}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.actionRow}>
                {applied ? (
                  <View style={styles.appliedBadge}>
                    <Icon source="check-circle" size={16} color={colors.success} />
                    <Text style={styles.appliedText}>応募済</Text>
                  </View>
                ) : (
                  <Button
                    mode="contained"
                    onPress={() => handleApply(item.id)}
                    loading={applying === item.id}
                    disabled={applying !== null}
                    style={styles.applyBtn}
                  >
                    応募する
                  </Button>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="bullhorn-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>公開中の募集はありません</Text>
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
    padding: spacing.lg, ...shadows.card,
  },
  title: { ...typography.titleSmall, color: colors.textPrimary },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  metaText: { ...typography.meta, color: colors.textTertiary },
  certRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  certBadge: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  certText: { ...typography.meta, color: colors.primary, fontSize: 10 },
  actionRow: { marginTop: spacing.md },
  appliedBadge: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  appliedText: { ...typography.label, color: colors.success },
  applyBtn: { borderRadius: radius.md },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
});
