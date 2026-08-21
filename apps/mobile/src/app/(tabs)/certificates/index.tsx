import { useCallback, useState } from "react";
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
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge, SegmentedControl } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

type CertFilter = "all" | "active" | "draft";

interface CertItem {
  id: string;
  certificate_no: string;
  status: string;
  service_type: string | null;
  issued_date: string | null;
  plate_display: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  customer_name: string | null;
}

const STATUS_MAP: Record<
  string,
  { label: string; severity: "success" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "有効", severity: "success" },
  draft: { label: "下書き", severity: "neutral" },
  void: { label: "無効", severity: "danger" },
  expired: { label: "期限切", severity: "warning" },
};

const FILTER_SEGMENTS: { value: CertFilter; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: "有効" },
  { value: "draft", label: "下書き" },
];

export default function CertificatesScreen() {
  const { user, selectedStore } = useAuthStore();
  const [filter, setFilter] = useState<CertFilter>("all");

  const {
    data: certs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["certificates", user?.tenantId, selectedStore?.id],
    queryFn: async () => {
      if (!user?.tenantId) return [];

      let query = supabase
        .from("certificates")
        .select(
          `id, certificate_no, status, service_type, issued_date,
           plate_display, vehicle_maker, vehicle_model, customer_name`
        )
        .eq("tenant_id", user.tenantId)
        .order("created_at", { ascending: false })
        .limit(200);

      // ponytail: skip store filter when id is empty (店舗なしで続行)
      if (selectedStore?.id) {
        query = query.eq("store_id", selectedStore.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CertItem[];
    },
    enabled: !!user?.tenantId,
    refetchInterval: 60_000,
  });

  const filtered =
    filter === "all" ? certs : certs.filter((c) => c.status === filter);

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ponytail: swallow
    }
  }, [refetch]);

  const renderItem = ({ item }: { item: CertItem }) => {
    const cfg = STATUS_MAP[item.status] ?? {
      label: item.status,
      severity: "neutral" as const,
    };
    const vehicleText = [item.vehicle_maker, item.vehicle_model]
      .filter(Boolean)
      .join(" ");

    return (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/certificates/${item.id}`)}
        accessibilityRole="button"
        accessibilityLabel={`証明書 ${item.certificate_no} ${cfg.label}`}
      >
        <View style={styles.cardHeader}>
          <View style={styles.certIcon}>
            <Icon
              source="shield-check-outline"
              size={20}
              color={
                item.status === "active" ? colors.success : colors.textTertiary
              }
            />
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.certNoText}>{item.certificate_no}</Text>
            <Text style={styles.serviceText} numberOfLines={1}>
              {item.service_type ?? "—"}
            </Text>
          </View>
          <StatusBadge label={cfg.label} severity={cfg.severity} compact />
        </View>

        {/* Meta row */}
        <View style={styles.metaRow}>
          {item.issued_date && (
            <View style={styles.metaItem}>
              <Icon
                source="calendar-outline"
                size={14}
                color={colors.textTertiary}
              />
              <Text style={styles.metaText}>{item.issued_date}</Text>
            </View>
          )}
          {item.plate_display && (
            <View style={styles.metaItem}>
              <Icon source="car" size={14} color={colors.textTertiary} />
              <Text style={styles.metaText}>{item.plate_display}</Text>
            </View>
          )}
          {item.customer_name && (
            <View style={styles.metaItem}>
              <Icon
                source="account-outline"
                size={14}
                color={colors.textTertiary}
              />
              <Text style={styles.metaText}>{item.customer_name}</Text>
            </View>
          )}
        </View>

        <View style={styles.chevron}>
          <Icon source="chevron-right" size={20} color={colors.textTertiary} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        <SegmentedControl
          segments={FILTER_SEGMENTS}
          value={filter}
          onChange={setFilter}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="certificate-outline"
            title="発行済み証明書はありません"
            description="施工完了後、品質確認を経て証明書が発行されます"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
    position: "relative",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  certIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: { flex: 1 },
  certNoText: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  serviceText: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginTop: spacing.md,
    marginLeft: 52,
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
});
