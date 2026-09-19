import { useCallback, useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Alert } from "react-native";
import { Text, Icon, Button, TextInput } from "react-native-paper";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Condition = {
  id: string; label: string; description: string | null;
  check_type: string; numeric_min: number | null; numeric_max: number | null;
  unit: string | null; is_required: boolean;
};
type Check = { condition_id: string; value_boolean: boolean | null; value_numeric: number | null; value_text: string | null; checked_at: string };
type JobDetail = { conditions: Condition[]; condition_checks: Check[] };

export default function ConditionChecksScreen() {
  const { jobId } = useLocalSearchParams<{ projectId: string; jobId: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const qk = ["ft-job-detail", user?.tenantId, jobId];
  const { data: job, isLoading, refetch } = useQuery({
    queryKey: qk,
    queryFn: () => mobileApi<JobDetail>(`/field-test/jobs/${jobId}`),
    enabled: !!user?.tenantId && !!jobId,
  });

  const conditions = job?.conditions ?? [];
  const checkMap = new Map((job?.condition_checks ?? []).map((c) => [c.condition_id, c]));

  const [saving, setSaving] = useState<string | null>(null);

  const save = useCallback(async (conditionId: string, value: Record<string, unknown>) => {
    setSaving(conditionId);
    try {
      await mobileApi("/field-test/condition-checks", {
        method: "POST",
        body: { job_id: jobId, condition_id: conditionId, ...value },
      });
      queryClient.invalidateQueries({ queryKey: qk });
    } catch (e: unknown) {
      Alert.alert("エラー", e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(null);
    }
  }, [jobId, qk, queryClient]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => refetch()} />}
    >
      {conditions.length === 0 ? (
        <Text style={styles.empty}>条件定義がありません</Text>
      ) : (
        conditions.map((cond) => {
          const check = checkMap.get(cond.id);
          const done = !!check;
          return (
            <View key={cond.id} style={[styles.card, done && styles.cardDone]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{cond.label}</Text>
                  {cond.is_required && <Text style={styles.required}>必須</Text>}
                  {cond.description && <Text style={styles.desc}>{cond.description}</Text>}
                </View>
                {done && <Icon source="check-circle" size={22} color={colors.success} />}
              </View>

              {done && (
                <Text style={styles.checkValue}>
                  {check.value_boolean != null ? (check.value_boolean ? "OK" : "NG") : ""}
                  {check.value_numeric != null ? `${check.value_numeric}${cond.unit ?? ""}` : ""}
                  {check.value_text ?? ""}
                  {"  "}{check.checked_at?.slice(0, 16).replace("T", " ")}
                </Text>
              )}

              {!done && cond.check_type === "boolean" && (
                <View style={styles.btnRow}>
                  <Button mode="contained" onPress={() => save(cond.id, { value_boolean: true })}
                    loading={saving === cond.id} buttonColor={colors.success} style={styles.btn}>OK</Button>
                  <Button mode="contained" onPress={() => save(cond.id, { value_boolean: false })}
                    loading={saving === cond.id} buttonColor={colors.danger} style={styles.btn}>NG</Button>
                </View>
              )}

              {!done && cond.check_type === "numeric" && (
                <NumericCheckInput
                  cond={cond}
                  saving={saving === cond.id}
                  onSave={(v) => save(cond.id, { value_numeric: v })}
                />
              )}

              {!done && cond.check_type === "text" && (
                <TextCheckInput
                  saving={saving === cond.id}
                  onSave={(v) => save(cond.id, { value_text: v })}
                />
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function NumericCheckInput({ cond, saving, onSave }: { cond: Condition; saving: boolean; onSave: (v: number) => void }) {
  const [val, setVal] = useState("");
  const hint = [cond.numeric_min != null ? `${cond.numeric_min}` : "", cond.numeric_max != null ? `${cond.numeric_max}` : ""]
    .filter(Boolean).join("〜");
  return (
    <View style={styles.inputRow}>
      <TextInput
        mode="outlined"
        value={val}
        onChangeText={setVal}
        keyboardType="numeric"
        placeholder={hint ? `${hint} ${cond.unit ?? ""}` : undefined}
        style={styles.input}
        dense
      />
      {cond.unit && <Text style={styles.unit}>{cond.unit}</Text>}
      <Button mode="contained" onPress={() => { if (val) onSave(Number(val)); }}
        disabled={saving || !val} loading={saving} compact>保存</Button>
    </View>
  );
}

function TextCheckInput({ saving, onSave }: { saving: boolean; onSave: (v: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <View style={styles.inputRow}>
      <TextInput mode="outlined" value={val} onChangeText={setVal} style={[styles.input, { flex: 1 }]} dense />
      <Button mode="contained" onPress={() => { if (val) onSave(val); }}
        disabled={saving || !val} loading={saving} compact>保存</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 80 },
  empty: { ...typography.bodySmall, color: colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.lg, ...shadows.card,
  },
  cardDone: { borderWidth: 1, borderColor: colors.success, shadowOpacity: 0, elevation: 0 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  label: { ...typography.label, color: colors.textPrimary },
  required: { ...typography.meta, color: colors.danger, marginTop: 2 },
  desc: { ...typography.meta, color: colors.textSecondary, marginTop: 2 },
  checkValue: { ...typography.meta, color: colors.textSecondary, marginTop: spacing.sm },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  btn: { flex: 1, borderRadius: radius.md },
  inputRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  input: { width: 120, backgroundColor: colors.surface },
  unit: { ...typography.meta, color: colors.textSecondary },
});
