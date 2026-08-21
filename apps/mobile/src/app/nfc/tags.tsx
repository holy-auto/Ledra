import { useCallback } from "react";
import { View, FlatList, StyleSheet, Pressable } from "react-native";
import { Text, ActivityIndicator, Icon } from "react-native-paper";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
  certificate_id: string | null;
  vehicle_id: string | null;
  certificate_no: string | null;
  plate_display: string | null;
}

// ponytail: map NFC tag statuses to StatusBadge severities
const STATUS_SEVERITY: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  prepared: "neutral",
  written: "info",
  attached: "success",
  lost: "danger",
  retired: "neutral",
  error: "danger",
};

export default function NfcTagsScreen() {
  const { user } = useAuthStore();

  const { data: tags, isLoading, refetch } = useQuery({
    queryKey: ["nfc-tags", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select(
          "id, tag_code, uid, status, certificate_id, vehicle_id, certificates(certificate_no), vehicles(plate_display)"
        )
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;

      return (data as unknown[]).map((row: any) => ({
        id: row.id,
        tag_code: row.tag_code,
        uid: row.uid,
        status: row.status,
        certificate_id: row.certificate_id,
        vehicle_id: row.vehicle_id,
        certificate_no: row.certificates?.certificate_no ?? null,
        plate_display: row.vehicles?.plate_display ?? null,
      })) as NfcTag[];
    },
    enabled: !!user?.tenantId,
  });

  const renderItem = useCallback(
    ({ item }: { item: NfcTag }) => (
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.tagIconWrap}>
            <Icon source="nfc" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tagCode}>{item.tag_code}</Text>
            {item.uid && (
              <Text style={styles.sub}>UID: {item.uid}</Text>
            )}
          </View>
          <StatusBadge
            label={item.status}
            severity={STATUS_SEVERITY[item.status] ?? "neutral"}
            compact
          />
        </View>

        {(item.certificate_no || item.plate_display) && (
          <View style={styles.linkedInfo}>
            {item.certificate_no && (
              <View style={styles.metaItem}>
                <Icon source="certificate" size={14} color={colors.textTertiary} />
                <Text style={styles.linked}>{item.certificate_no}</Text>
              </View>
            )}
            {item.plate_display && (
              <View style={styles.metaItem}>
                <Icon source="car-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.linked}>{item.plate_display}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    ),
    []
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.primary} />
      ) : (
        <FlatList
          data={tags}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <EmptyState
              icon="nfc"
              title="NFCタグはありません"
              description="NFCタグを書き込むと、ここに一覧表示されます"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  tagIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tagCode: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  sub: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  linkedInfo: {
    marginTop: spacing.md,
    marginLeft: 52,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  linked: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  loading: { marginTop: spacing["3xl"] },
});
