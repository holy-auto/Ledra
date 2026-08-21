import { useState, useCallback } from "react";
import { View, FlatList, StyleSheet, Pressable } from "react-native";
import { Text, ActivityIndicator } from "react-native-paper";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

type CertStatus = "active" | "draft" | "void" | "expired";

interface Certificate {
  id: string;
  certificate_no: string | null;
  customer_name: string | null;
  status: string;
  service_type: string | null;
  created_at: string;
  vehicle: {
    plate_display: string | null;
    maker: string | null;
    model: string | null;
  } | null;
}

const STATUS_SEGMENTS: { value: CertStatus; label: string }[] = [
  { value: "active", label: "有効" },
  { value: "draft", label: "下書き" },
  { value: "void", label: "無効" },
  { value: "expired", label: "期限切" },
];

const STATUS_SEVERITY: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  active: "success",
  draft: "neutral",
  void: "danger",
  expired: "warning",
};

const STATUS_LABEL: Record<string, string> = {
  active: "有効",
  draft: "下書き",
  void: "無効",
  expired: "期限切",
};

export default function CertificatesIndexScreen() {
  const { user } = useAuthStore();
  const [statusFilter, setStatusFilter] = useState<CertStatus>("active");

  const { data: certificates, isLoading, refetch } = useQuery({
    queryKey: ["certificates", user?.tenantId, statusFilter],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          `id, certificate_no, customer_name, status, service_type, created_at,
           vehicle:vehicles(plate_display, maker, model)`
        )
        .eq("tenant_id", user!.tenantId)
        .eq("status", statusFilter)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Certificate[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: Certificate }) => (
      <Pressable
        style={styles.card}
        onPress={() => router.push(`/certificates/${item.id}`)}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          <Text style={styles.certNo}>
            {item.certificate_no ?? "(番号未設定)"}
          </Text>
          <StatusBadge
            label={STATUS_LABEL[item.status] ?? item.status}
            severity={STATUS_SEVERITY[item.status] ?? "neutral"}
            compact
          />
        </View>
        {item.customer_name && (
          <Text style={styles.customer}>{item.customer_name}</Text>
        )}
        <Text style={styles.sub}>
          {[item.vehicle?.maker, item.vehicle?.model, item.vehicle?.plate_display]
            .filter(Boolean)
            .join(" ")}
        </Text>
        <Text style={styles.sub}>
          発行日: {new Date(item.created_at).toLocaleDateString("ja-JP")}
        </Text>
      </Pressable>
    ),
    []
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <SegmentedControl
          segments={STATUS_SEGMENTS}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </View>
      {isLoading ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={certificates}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <Text style={styles.empty}>証明書が見つかりません</Text>
          }
        />
      )}
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
  list: { padding: spacing.md, paddingBottom: spacing["2xl"], gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  certNo: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  customer: {
    ...typography.body,
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  sub: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: 2,
  },
  loading: { marginTop: spacing["3xl"] },
  empty: {
    ...typography.body,
    textAlign: "center",
    color: colors.textSecondary,
    marginTop: spacing["3xl"],
  },
});
