import { useCallback, useState } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Pressable } from "react-native";
import { Text, Icon } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { SegmentedControl, StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { DOC_TYPES, statusLabel, statusVariant, type DocType } from "@/types/document";
import { colors, spacing, radius, typography, shadows, sizing } from "@/constants/tokens";

/**
 * 帳票（見積・請求など）の一覧。
 *
 * 読み取りは Supabase 直読み。documents に auth.uid() を直接見る SELECT ポリシーが
 * あるので通る。外注請求書は RESTRICTIVE ポリシーで管理ロール以外には最初から
 * 見えないため、画面側で分岐しない。
 */

interface DocRow {
  id: string;
  doc_type: DocType;
  doc_number: string;
  issued_at: string | null;
  due_date: string | null;
  status: string;
  total: number | null;
  customer_id: string | null;
  customers: { name: string | null } | null;
}

/** 現場で使うのは見積と請求。それ以外は「すべて」で見る */
type TypeFilter = "estimate" | "invoice" | "all";

const TYPE_SEGMENTS: { value: TypeFilter; label: string }[] = [
  { value: "estimate", label: "見積書" },
  { value: "invoice", label: "請求書" },
  { value: "all", label: "すべて" },
];

/** Web の statusVariant は "default" を返す。モバイルの StatusBadge には無いので寄せる */
function badgeSeverity(status: string) {
  const v = statusVariant(status);
  return v === "default" ? ("neutral" as const) : v;
}

const yen = (n: number | null) => `¥${(n ?? 0).toLocaleString("ja-JP")}`;

export default function DocumentsScreen() {
  const { user } = useAuthStore();
  // 通知からは /documents?type=estimate で飛んでくる
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [filter, setFilter] = useState<TypeFilter>(
    type === "invoice" ? "invoice" : type === "all" ? "all" : "estimate",
  );

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["documents", user?.tenantId, filter],
    queryFn: async () => {
      let q = supabase
        .from("documents")
        .select(
          "id, doc_type, doc_number, issued_at, due_date, status, total, customer_id, customers(name)",
        )
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      // 請求書タブは合算請求書も同じ束で見たい（現場では区別しない）
      if (filter === "estimate") q = q.eq("doc_type", "estimate");
      else if (filter === "invoice") q = q.in("doc_type", ["invoice", "consolidated_invoice"]);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as DocRow[];
    },
    enabled: !!user?.tenantId,
    refetchInterval: 60_000,
  });

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // 引っ張って更新の失敗は画面に出さない
    }
  }, [refetch]);

  const renderItem = ({ item }: { item: DocRow }) => {
    const meta = DOC_TYPES[item.doc_type];
    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/documents/${item.id}` as never)}
        accessibilityRole="button"
        accessibilityLabel={`${meta?.label ?? item.doc_type} ${item.doc_number}`}
      >
        <View style={styles.cardHead}>
          <View style={styles.headLeft}>
            <Text style={styles.docType}>{meta?.label ?? item.doc_type}</Text>
            <Text style={styles.docNumber}>{item.doc_number}</Text>
          </View>
          <StatusBadge label={statusLabel(item.status)} severity={badgeSeverity(item.status)} compact />
        </View>

        <Text style={styles.customer} numberOfLines={1}>
          {item.customers?.name ?? "宛先未設定"}
        </Text>

        <View style={styles.cardFoot}>
          <Text style={styles.date}>
            {item.issued_at ? dayjs(item.issued_at).format("YYYY/M/D") : "発行日未設定"}
          </Text>
          <Text style={styles.total}>{yen(item.total)}</Text>
          <Icon source="chevron-right" size={18} color={colors.textTertiary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        <SegmentedControl segments={TYPE_SEGMENTS} value={filter} onChange={setFilter} />
      </View>

      <FlatList
        data={data}
        keyExtractor={(d) => d.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="file-document-outline"
            title={filter === "estimate" ? "見積書はまだありません" : "帳票はまだありません"}
            description="管理画面や AI の見積ドラフトで作成された帳票がここに表示されます"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing["3xl"] },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
    minHeight: sizing.touchTarget,
    ...shadows.card,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headLeft: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  docType: { ...typography.titleSmall, color: colors.textPrimary },
  docNumber: { ...typography.meta, color: colors.textSecondary },
  customer: { ...typography.body, color: colors.textPrimary },
  cardFoot: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  date: { ...typography.meta, color: colors.textSecondary, flex: 1 },
  total: { ...typography.titleSmall, color: colors.textPrimary },
});
