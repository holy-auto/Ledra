import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Pressable } from "react-native";
import { Text, Icon, Button, Divider } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Inspection = { id: string; result: string; score: number | null; notes: string | null; inspected_at: string | null };
type Defect = { id: string; defect_code: string | null; title: string; severity: string; status: string };
type JobDetail = {
  id: string; job_code: string | null; title: string; description: string | null;
  status: string; assigned_at: string; completed_at: string | null;
  conditions: { id: string; label: string; check_type: string; is_required: boolean }[];
  condition_checks: { condition_id: string }[];
  evidence: { id: string; evidence_type: string; file_name: string | null }[];
  inspections: Inspection[];
  defects: Defect[];
};

const STATUS_LABELS: Record<string, { label: string; severity: "info" | "success" | "warning" }> = {
  assigned: { label: "割当済", severity: "info" },
  in_progress: { label: "施工中", severity: "warning" },
  evidence_submitted: { label: "証拠提出済", severity: "info" },
  inspection: { label: "検査中", severity: "warning" },
  completed: { label: "完了", severity: "success" },
  rejected: { label: "差戻し", severity: "warning" },
};
const RESULT_JA: Record<string, string> = { pending: "未検査", pass: "合格", fail: "不合格", conditional_pass: "条件付合格" };
const SEV_JA: Record<string, string> = { low: "軽微", medium: "中", high: "重大", critical: "致命的" };

export default function FieldTestJobDetailScreen() {
  const { projectId, jobId } = useLocalSearchParams<{ projectId: string; jobId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [acting, setActing] = useState(false);

  const qk = ["ft-job-detail", user?.tenantId, jobId];
  const { data: job, isLoading, refetch } = useQuery({
    queryKey: qk,
    queryFn: () => mobileApi<JobDetail>(`/field-test/jobs/${jobId}`),
    enabled: !!user?.tenantId && !!jobId,
  });

  const changeStatus = useCallback(async (newStatus: string) => {
    setActing(true);
    try {
      await mobileApi(`/field-test/jobs/${jobId}`, { method: "PATCH", body: { status: newStatus } });
      queryClient.invalidateQueries({ queryKey: qk });
    } catch (e: unknown) {
      Alert.alert("エラー", e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setActing(false);
    }
  }, [jobId, qk, queryClient]);

  if (isLoading || !job) {
    return (
      <View style={styles.container}>
        <Text style={styles.loading}>{isLoading ? "読み込み中..." : "案件が見つかりません"}</Text>
      </View>
    );
  }

  const cfg = STATUS_LABELS[job.status] ?? { label: job.status, severity: "info" as const };
  const checksComplete = `${job.condition_checks.length} / ${job.conditions.length}`;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{job.title}</Text>
          {job.job_code && <Text style={styles.code}>{job.job_code}</Text>}
        </View>
        <StatusBadge label={cfg.label} severity={cfg.severity} />
      </View>

      {job.description && <Text style={styles.desc}>{job.description}</Text>}

      {/* Actions */}
      {job.status === "assigned" && (
        <Button mode="contained" onPress={() => changeStatus("in_progress")} loading={acting} style={styles.actionBtn}>
          作業開始
        </Button>
      )}
      {job.status === "in_progress" && (
        <Button mode="contained" onPress={() => changeStatus("evidence_submitted")} loading={acting} style={styles.actionBtn}>
          証拠を提出
        </Button>
      )}

      {/* Summary Cards */}
      <View style={styles.cardRow}>
        <SummaryCard label="条件チェック" value={checksComplete} icon="clipboard-check-outline" />
        <SummaryCard label="証拠" value={String(job.evidence.length)} icon="camera-outline" />
        <SummaryCard label="検査" value={String(job.inspections.length)} icon="shield-check-outline" />
        <SummaryCard label="不具合" value={String(job.defects.length)} icon="alert-circle-outline" />
      </View>

      {/* Navigation Buttons */}
      {job.status === "in_progress" && (
        <View style={styles.navSection}>
          <NavButton
            label="条件チェックを入力"
            icon="clipboard-list-outline"
            onPress={() => router.push(`/field-test/${projectId}/${jobId}/checks`)}
          />
          <NavButton
            label="証拠をアップロード"
            icon="camera-plus-outline"
            onPress={() => router.push(`/field-test/${projectId}/${jobId}/evidence`)}
          />
        </View>
      )}

      {/* Inspections */}
      {job.inspections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>検査結果</Text>
          {job.inspections.map((ins) => (
            <View key={ins.id} style={styles.listItem}>
              <Text style={styles.listLabel}>{RESULT_JA[ins.result] ?? ins.result}</Text>
              {ins.score != null && <Text style={styles.listValue}>{ins.score}点</Text>}
              {ins.notes && <Text style={styles.listMeta} numberOfLines={2}>{ins.notes}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Defects */}
      {job.defects.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>不具合</Text>
          {job.defects.map((d) => (
            <View key={d.id} style={styles.listItem}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={styles.listLabel}>{d.title}</Text>
                <Text style={[styles.badge, d.severity === "critical" || d.severity === "high" ? styles.badgeDanger : styles.badgeWarn]}>
                  {SEV_JA[d.severity] ?? d.severity}
                </Text>
              </View>
              {d.defect_code && <Text style={styles.listMeta}>{d.defect_code}</Text>}
            </View>
          ))}
        </View>
      )}

      <Divider style={{ marginTop: spacing.xl }} />
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>割当日</Text>
        <Text style={styles.metaValue}>{job.assigned_at?.slice(0, 10) ?? "-"}</Text>
      </View>
      {job.completed_at && (
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>完了日</Text>
          <Text style={styles.metaValue}>{job.completed_at.slice(0, 10)}</Text>
        </View>
      )}
    </ScrollView>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <View style={styles.summaryCard}>
      <Icon source={icon} size={20} color={colors.primary} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function NavButton({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable style={styles.navBtn} onPress={onPress} accessibilityRole="button">
      <Icon source={icon} size={22} color={colors.primary} />
      <Text style={styles.navBtnText}>{label}</Text>
      <Icon source="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  loading: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center", marginTop: 40 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md, marginBottom: spacing.sm },
  title: { ...typography.titleSmall, color: colors.textPrimary, fontSize: 18 },
  code: { ...typography.meta, color: colors.textTertiary, fontFamily: "monospace", marginTop: 2 },
  desc: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: spacing.md },
  actionBtn: { marginBottom: spacing.lg, borderRadius: radius.md },
  cardRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  summaryCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.md, alignItems: "center", gap: spacing.xs, ...shadows.card,
  },
  summaryValue: { ...typography.titleSmall, color: colors.textPrimary, fontSize: 18 },
  summaryLabel: { ...typography.meta, color: colors.textTertiary, fontSize: 10, textAlign: "center" },
  navSection: { gap: spacing.sm, marginBottom: spacing.lg },
  navBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.lg, ...shadows.card,
  },
  navBtnText: { ...typography.label, color: colors.textPrimary, flex: 1 },
  section: { marginTop: spacing.lg },
  sectionTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.sm },
  listItem: { backgroundColor: colors.surfaceVariant, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.xs },
  listLabel: { ...typography.label, color: colors.textPrimary },
  listValue: { ...typography.bodySmall, color: colors.primary, fontWeight: "700" },
  listMeta: { ...typography.meta, color: colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },
  badgeDanger: { backgroundColor: colors.dangerLight, color: colors.danger },
  badgeWarn: { backgroundColor: colors.warningLight, color: colors.warning },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: spacing.sm },
  metaLabel: { ...typography.meta, color: colors.textTertiary },
  metaValue: { ...typography.bodySmall, color: colors.textPrimary },
});
