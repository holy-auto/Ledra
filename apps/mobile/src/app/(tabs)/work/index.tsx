import { useCallback, useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Icon } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { scopeToStore } from "@/lib/storeScope";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { useTabContentInset } from "@/hooks/useTabContentInset";
import { TabTopBar } from "@/components/TabTopBar";
import { parseMenuItems } from "@/lib/reservationItems";
import { getWorkPresentation } from "@/lib/workPresentation";
import { useDisplayMode } from "@/stores/uiPreferencesStore";
import { colors, spacing, radius, sizing, typography, shadows } from "@/constants/tokens";

type WorkStatus = "arrived" | "in_progress" | "completed";

interface WorkItem {
  id: string;
  status: WorkStatus;
  scheduled_date: string | null;
  start_time: string | null;
  customer: { id: string; name: string } | null;
  vehicle: {
    id: string;
    plate_display: string;
    maker: string;
    model: string;
  } | null;
  assigned_staff: { id: string; name: string } | null;
  menu_items_json: unknown;
}

type WorkQueryResult = {
  items: WorkItem[];
  total: number;
};

const EMPTY_WORK_ITEMS: WorkItem[] = [];

const STATUS_CONFIG: Record<
  WorkStatus,
  { label: string; severity: "warning" | "info" | "success" }
> = {
  arrived: { label: "来店", severity: "warning" },
  in_progress: { label: "作業中", severity: "info" },
  completed: { label: "完了", severity: "success" },
};

export default function WorkScreen() {
  const tabInset = useTabContentInset();
  const [search, setSearch] = useState("");
  const { user, selectedStore } = useAuthStore();
  const displayMode = useDisplayMode();
  const presentation = getWorkPresentation(displayMode);

  const {
    data: workResult,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["work", user?.tenantId, selectedStore?.id, presentation.queryLimit],
    queryFn: async () => {
      if (!user?.tenantId) return { items: [], total: 0 } satisfies WorkQueryResult;

      // staff_members の SELECT は RLS で owner/admin 以上に限定されている。
      // staff / viewer では埋め込みが null になり担当者が出ない（エラーにはならない）。
      // 現場ロールにも見せるなら RLS を緩めるか、サーバ経由で引く必要がある。
      //
      // **この注記を select 文字列の中に書かないこと。** PostgREST は中身を
      // そのまま列名として受け取るので、クエリごと 400 になり一覧が空になる。
      let query = supabase
        .from("reservations")
        .select(
          `
          id, status, scheduled_date, start_time,
          customer:customers ( id, name ),
          vehicle:vehicles ( id, plate_display, maker, model ),
          assigned_staff:staff_members ( id, name ),
          menu_items_json
        `,
          { count: "exact" },
        )
        .eq("tenant_id", user.tenantId)
        .in("status", ["arrived", "in_progress"])
        .order("scheduled_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(presentation.queryLimit);

      query = scopeToStore(query, selectedStore?.id);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        items: (data ?? []) as unknown as WorkItem[],
        total: count ?? data?.length ?? 0,
      } satisfies WorkQueryResult;
    },
    enabled: !!user?.tenantId,
    refetchInterval: 30_000,
  });

  const items = workResult?.items ?? EMPTY_WORK_ITEMS;
  const total = workResult?.total ?? 0;

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ponytail: swallow — pull-to-refresh spinner handled by isLoading
    }
  }, [refetch]);

  const formatTime = (t: string | null) => {
    if (!t) return "--:--";
    return t.slice(0, 5);
  };

  const renderItem = ({ item }: { item: WorkItem }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.arrived;
    const isSimple = presentation.cardVariant === "simple";
    const isDense = presentation.cardVariant === "dense";
    const serviceNames = parseMenuItems(item.menu_items_json)
      .map((m) => m.name)
      .join("、");

    return (
      <Pressable
        style={[styles.card, isSimple && styles.cardSimple, isDense && styles.cardDense]}
        onPress={() => router.push(`/work/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`${item.vehicle?.plate_display ?? "車両不明"} ${cfg.label}`}
      >
        {/* Top row: vehicle + status */}
        <View style={[styles.cardHeader, isDense && styles.cardHeaderDense]}>
          {!isDense && (
            <View style={[styles.vehicleIcon, isSimple && styles.vehicleIconSimple]}>
              <Icon source="car" size={isSimple ? 24 : 20} color={colors.primary} />
            </View>
          )}
          <View style={styles.cardHeaderText}>
            <Text style={[styles.plateText, isSimple && styles.plateTextSimple, isDense && styles.plateTextDense]}>
              {item.vehicle?.plate_display ?? "車両未登録"}
            </Text>
            {!isDense && (
              <Text style={styles.vehicleModel} numberOfLines={1}>
                {item.vehicle ? `${item.vehicle.maker} ${item.vehicle.model}` : ""}
              </Text>
            )}
          </View>
          <StatusBadge label={cfg.label} severity={cfg.severity} />
        </View>

        {/* Service info */}
        {serviceNames && !isDense ? (
          <Text style={[styles.serviceText, isSimple && styles.serviceTextSimple]} numberOfLines={1}>
            {serviceNames}
          </Text>
        ) : null}

        {/* Bottom row: time + customer + staff */}
        <View style={[styles.metaRow, isSimple && styles.metaRowSimple, isDense && styles.metaRowDense]}>
          <View style={styles.metaItem}>
            <Icon source="clock-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>{formatTime(item.start_time)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Icon source="account-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {item.customer?.name ?? "未登録"}
            </Text>
          </View>
          {item.assigned_staff && !isSimple && (
            <View style={styles.metaItem}>
              <Icon source="wrench-outline" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>
                {item.assigned_staff.name}
              </Text>
            </View>
          )}
        </View>

        {isSimple ? (
          <View style={styles.simpleCta}>
            <Text style={styles.simpleCtaText}>作業を開く</Text>
            <Icon source="arrow-right" size={20} color={colors.textOnPrimary} />
          </View>
        ) : (
          <View style={[styles.chevron, isDense && styles.chevronDense]}>
            <Icon source="chevron-right" size={20} color={colors.textTertiary} />
          </View>
        )}
      </Pressable>
    );
  };

  // 車両ナンバー・車種・顧客名・メニューで横断検索
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      !q
        ? items
        : items.filter((i) =>
            [
              i.vehicle?.plate_display,
              i.vehicle?.maker,
              i.vehicle?.model,
              i.customer?.name,
              i.assigned_staff?.name,
              ...parseMenuItems(i.menu_items_json).map((m) => m.name),
            ].some((v) => (v ?? "").toLowerCase().includes(q)),
          ),
    [items, q],
  );

  return (
    <View style={styles.container}>
      <TabTopBar
        search={search}
        onSearchChange={setSearch}
        placeholder="ナンバー・車種・顧客名で検索"
      />
      <FlatList
        data={filtered}
        // 検索中の1タップ目がキーボード閉じに吸われないように
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        initialNumToRender={presentation.initialNumToRender}
        maxToRenderPerBatch={presentation.maxToRenderPerBatch}
        windowSize={presentation.windowSize}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={[
          styles.listContent,
          presentation.cardVariant === "dense" && styles.listContentDense,
          { paddingBottom: tabInset },
        ]}
        ListHeaderComponent={
          total > items.length ? (
            <View style={styles.limitNotice}>
              <Icon source="information-outline" size={18} color={colors.textSecondary} />
              <Text style={styles.limitNoticeText}>先頭{items.length}件を表示しています。検索で絞り込んでください。</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          search.trim() ? (
            <View style={styles.empty}>
              <Icon source="magnify" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>
                「{search.trim()}」に一致する作業はありません
              </Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Icon source="wrench-outline" size={48} color={colors.textTertiary} />
              <Text style={styles.emptyTitle}>作業中の予約はありません</Text>
              <Text style={styles.emptyDesc}>
                入庫した車両がここに表示されます
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.lg, gap: spacing.md },
  listContentDense: { gap: spacing.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
    position: "relative",
  },
  cardSimple: {
    padding: spacing.xl,
  },
  cardDense: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardHeaderDense: {
    gap: spacing.sm,
    paddingRight: spacing["3xl"],
  },
  vehicleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleIconSimple: {
    width: 48,
    height: 48,
  },
  cardHeaderText: { flex: 1 },
  plateText: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  plateTextSimple: {
    fontSize: 20,
    lineHeight: 26,
  },
  plateTextDense: {
    fontSize: 14,
    lineHeight: 18,
  },
  vehicleModel: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  serviceText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginLeft: 52, // aligned with text after icon
  },
  serviceTextSimple: {
    marginLeft: 60,
    fontSize: 15,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.md,
    marginLeft: 52,
  },
  metaRowSimple: {
    marginLeft: 60,
  },
  metaRowDense: {
    marginTop: spacing.xs,
    marginLeft: 0,
    paddingRight: spacing["3xl"],
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  metaText: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  chevron: {
    position: "absolute",
    right: spacing.lg,
    top: "50%",
    marginTop: -10,
  },
  chevronDense: {
    right: spacing.sm,
  },
  simpleCta: {
    minHeight: sizing.touchTarget,
    marginTop: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  simpleCtaText: {
    ...typography.label,
    color: colors.textOnPrimary,
  },
  limitNotice: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  limitNoticeText: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.textSecondary,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});
