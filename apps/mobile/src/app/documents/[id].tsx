import { useState } from "react";
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator } from "react-native";
import { Text, Icon, Snackbar } from "react-native-paper";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";

import { supabase } from "@/lib/supabase";
import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  DOC_TYPES,
  nextStatusesFor,
  statusLabel,
  statusVariant,
  type DocType,
  type DocumentItem,
} from "@/types/document";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/**
 * 帳票の詳細。読み取りは Supabase 直読み、ステータス変更だけ API 経由。
 *
 * 確定 (下書き→送付済) は電帳法の封印・自動送付・見積フローの進行を伴うので、
 * 端末から直接 UPDATE してはいけない。/api/mobile/documents の PUT を通す。
 */

interface DocDetail {
  id: string;
  doc_type: DocType;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  status: string;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  tax_rate: number | null;
  items_json: DocumentItem[] | null;
  note: string | null;
  recipient_name: string | null;
  recipient_honorific: string | null;
  subject: string | null;
  payment_date: string | null;
  customers: { name: string | null } | null;
}

function badgeSeverity(status: string) {
  const v = statusVariant(status);
  return v === "default" ? ("neutral" as const) : v;
}

const yen = (n: number | null | undefined) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [snackbar, setSnackbar] = useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(
          "id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, items_json, note, recipient_name, recipient_honorific, subject, payment_date, customers(name)",
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as unknown as DocDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      mobileApi("/documents", { method: "PUT", body: { id, status } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", id] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setSnackbar("ステータスを更新しました");
    },
    onError: (e) => setSnackbar(e instanceof Error ? e.message : "更新に失敗しました"),
  });

  function confirmStatus(next: string) {
    const label = statusLabel(next);
    // 確定は後戻りできない（封印が付き、設定によっては顧客へ自動送付される）
    const warning =
      next === "sent"
        ? "確定すると内容が封印され、設定によっては顧客へ自動送付されます。取り消せません。"
        : `ステータスを「${label}」に変更します。`;
    Alert.alert(`${label}にする`, warning, [
      { text: "キャンセル", style: "cancel" },
      { text: label, onPress: () => statusMutation.mutate(next) },
    ]);
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "帳票" }} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // 取得に失敗した場合に何も出さないと、白い画面のまま止まって原因が分からない
  if (isError || !data) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: "帳票" }} />
        <EmptyState
          icon="alert-circle-outline"
          title="帳票を読み込めませんでした"
          description="通信状況を確認して、もう一度お試しください"
          actionLabel="再読み込み"
          onAction={() => refetch()}
        />
      </View>
    );
  }

  const meta = DOC_TYPES[data.doc_type];
  const items = (data.items_json ?? []).filter((i) => (i.item_type ?? "item") === "item");
  const nextStatuses = nextStatusesFor(data.doc_type, data.status);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: meta?.label ?? "帳票" }} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* 見出し */}
        <View style={styles.card}>
          <View style={styles.headRow}>
            <View style={styles.headLeft}>
              <Text style={styles.docType}>{meta?.label ?? data.doc_type}</Text>
              <Text style={styles.docNumber}>{data.doc_number}</Text>
            </View>
            <StatusBadge label={statusLabel(data.status)} severity={badgeSeverity(data.status)} />
          </View>

          <Text style={styles.recipient}>
            {data.recipient_name ?? data.customers?.name ?? "宛先未設定"}
            {data.recipient_honorific ? ` ${data.recipient_honorific}` : ""}
          </Text>
          {!!data.subject && <Text style={styles.subject}>{data.subject}</Text>}

          <View style={styles.divider} />

          <InfoRow
            label="発行日"
            value={data.issued_at ? dayjs(data.issued_at).format("YYYY/M/D") : "—"}
          />
          <InfoRow
            label="期日"
            value={data.due_date ? dayjs(data.due_date).format("YYYY/M/D") : "—"}
          />
          {!!data.payment_date && (
            <InfoRow label="入金日" value={dayjs(data.payment_date).format("YYYY/M/D")} />
          )}
        </View>

        {/* 明細 */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>明細</Text>
          {items.length === 0 ? (
            <Text style={styles.emptyItems}>明細がありません</Text>
          ) : (
            items.map((item, i) => (
              <View key={`${item.description}-${i}`} style={styles.itemRow}>
                <View style={styles.itemMain}>
                  <Text style={styles.itemDesc}>{item.description}</Text>
                  <Text style={styles.itemQty}>
                    {item.quantity} {item.unit ?? "個"} × {yen(item.unit_price)}
                  </Text>
                </View>
                <Text style={styles.itemAmount}>{yen(item.amount)}</Text>
              </View>
            ))
          )}

          <View style={styles.divider} />
          <InfoRow label="小計" value={yen(data.subtotal)} />
          <InfoRow label={`消費税（${data.tax_rate ?? 10}%）`} value={yen(data.tax)} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>合計</Text>
            <Text style={styles.totalValue}>{yen(data.total)}</Text>
          </View>
        </View>

        {!!data.note && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>備考</Text>
            <Text style={styles.note}>{data.note}</Text>
          </View>
        )}

        {/* ステータス変更 */}
        {nextStatuses.length > 0 && (
          <View style={styles.actions}>
            {nextStatuses.map((next) => (
              <LedraButton
                key={next}
                variant={next === "sent" ? "primary" : "outline"}
                onPress={() => confirmStatus(next)}
                loading={statusMutation.isPending}
                disabled={statusMutation.isPending}
                fullWidth
              >
                {next === "sent" ? "確定して送付済にする" : `${statusLabel(next)}にする`}
              </LedraButton>
            ))}
          </View>
        )}

        <View style={styles.hint}>
          <Icon source="information-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.hintText}>
            内容の編集と PDF の出力は管理画面から行ってください。
          </Text>
        </View>
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing["4xl"] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadows.card,
  },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headLeft: { flex: 1, gap: 2 },
  docType: { ...typography.titleMedium, color: colors.textPrimary },
  docNumber: { ...typography.meta, color: colors.textSecondary },
  recipient: { ...typography.titleSmall, color: colors.textPrimary, marginTop: spacing.sm },
  subject: { ...typography.bodySmall, color: colors.textSecondary },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  sectionTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.xs },
  emptyItems: { ...typography.bodySmall, color: colors.textTertiary },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemMain: { flex: 1, gap: 2 },
  itemDesc: { ...typography.body, color: colors.textPrimary },
  itemQty: { ...typography.meta, color: colors.textSecondary },
  itemAmount: { ...typography.body, color: colors.textPrimary, fontWeight: "600" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  infoLabel: { ...typography.bodySmall, color: colors.textSecondary },
  infoValue: { ...typography.bodySmall, color: colors.textPrimary },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: spacing.sm,
  },
  totalLabel: { ...typography.titleSmall, color: colors.textPrimary },
  totalValue: { ...typography.titleLarge, color: colors.textPrimary },
  note: { ...typography.bodySmall, color: colors.textSecondary },
  actions: { gap: spacing.md },
  hint: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.xs },
  hintText: { ...typography.meta, color: colors.textSecondary, flex: 1 },
});
