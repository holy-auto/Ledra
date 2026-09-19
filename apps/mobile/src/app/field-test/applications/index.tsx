import { useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Alert } from "react-native";
import { Text, Icon, Button } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Application = {
  id: string;
  status: string;
  notes: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  recruitment_id: string;
  project_id: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: "審査中", color: "#92400E", bg: "#FEF3C7", icon: "clock-outline" },
  approved: { label: "承認", color: "#065F46", bg: "#D1FAE5", icon: "check-circle-outline" },
  rejected: { label: "却下", color: "#991B1B", bg: "#FEE2E2", icon: "close-circle-outline" },
  withdrawn: { label: "取下げ", color: "#6B7280", bg: "#F3F4F6", icon: "undo" },
};

export default function ApplicationsScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ft-applications", user?.tenantId],
    queryFn: () => mobileApi<{ applications: Application[] }>("/field-test/applications"),
    enabled: !!user?.tenantId,
  });

  const applications = data?.applications ?? [];

  const handleWithdraw = useCallback(
    (appId: string) => {
      Alert.alert("確認", "応募を取り下げますか？", [
        { text: "キャンセル", style: "cancel" },
        {
          text: "取り下げる",
          style: "destructive",
          onPress: async () => {
            try {
              await mobileApi(`/field-test/applications/${appId}`, {
                method: "PATCH",
                body: { action: "withdraw" },
              });
              queryClient.invalidateQueries({ queryKey: ["ft-applications"] });
              Alert.alert("完了", "応募を取り下げました");
            } catch (e: unknown) {
              Alert.alert("エラー", e instanceof Error ? e.message : "取り下げに失敗しました");
            }
          },
        },
      ]);
    },
    [queryClient],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={applications}
        keyExtractor={(a) => a.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Icon source={cfg.icon} size={14} color={cfg.color} />
                  <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <Text style={styles.date}>{item.created_at?.slice(0, 10)}</Text>
              </View>

              {item.notes && (
                <View style={styles.noteRow}>
                  <Text style={styles.noteLabel}>応募メモ:</Text>
                  <Text style={styles.noteText}>{item.notes}</Text>
                </View>
              )}

              {item.review_notes && (
                <View style={styles.noteRow}>
                  <Text style={styles.noteLabel}>レビュー:</Text>
                  <Text style={styles.noteText}>{item.review_notes}</Text>
                </View>
              )}

              {item.reviewed_at && (
                <Text style={styles.reviewDate}>
                  審査日: {item.reviewed_at.slice(0, 10)}
                </Text>
              )}

              {item.status === "pending" && (
                <View style={styles.actionRow}>
                  <Button
                    mode="outlined"
                    onPress={() => handleWithdraw(item.id)}
                    textColor={colors.danger}
                    style={styles.withdrawBtn}
                    labelStyle={styles.withdrawLabel}
                  >
                    取り下げる
                  </Button>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Icon source="file-document-outline" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>応募はありません</Text>
            <Text style={styles.emptyDesc}>募集一覧から応募できます</Text>
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
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusText: { fontSize: 12, fontWeight: "600" },
  date: { ...typography.meta, color: colors.textTertiary },
  noteRow: { marginTop: spacing.sm },
  noteLabel: { ...typography.meta, color: colors.textTertiary, marginBottom: 2 },
  noteText: { ...typography.bodySmall, color: colors.textSecondary },
  reviewDate: { ...typography.meta, color: colors.textTertiary, marginTop: spacing.sm },
  actionRow: { marginTop: spacing.md },
  withdrawBtn: { borderColor: colors.danger, borderRadius: radius.md },
  withdrawLabel: { fontSize: 13 },
  empty: { alignItems: "center", paddingTop: 80, gap: spacing.sm },
  emptyTitle: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.lg },
  emptyDesc: { ...typography.bodySmall, color: colors.textSecondary },
});
