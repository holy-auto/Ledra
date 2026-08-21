import { useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Icon, ActivityIndicator } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { StatusBadge } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface VehicleDetail {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  customer_id: string | null;
  customer_name: string | null;
}

interface Certificate {
  id: string;
  certificate_no: string;
  status: string;
  issued_date: string | null;
  service_type: string | null;
}

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
}

const CERT_STATUS_MAP: Record<
  string,
  { label: string; severity: "success" | "warning" | "danger" | "neutral" }
> = {
  active: { label: "有効", severity: "success" },
  draft: { label: "下書き", severity: "neutral" },
  void: { label: "無効", severity: "danger" },
  expired: { label: "期限切", severity: "warning" },
};

const NFC_STATUS_MAP: Record<
  string,
  { label: string; severity: "success" | "info" | "danger" | "neutral" }
> = {
  prepared: { label: "準備済", severity: "neutral" },
  written: { label: "書込済", severity: "info" },
  attached: { label: "装着済", severity: "success" },
  lost: { label: "紛失", severity: "danger" },
  retired: { label: "退役", severity: "neutral" },
  error: { label: "エラー", severity: "danger" },
};

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const {
    data: vehicle,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["vehicle", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select(
          "id, maker, model, year, plate_display, customer_id, customer_name"
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as VehicleDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: certificates = [] } = useQuery({
    queryKey: ["vehicle-certificates", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("id, certificate_no, status, issued_date, service_type")
        .eq("vehicle_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Certificate[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: nfcTags = [] } = useQuery({
    queryKey: ["vehicle-nfc-tags", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select("id, tag_code, uid, status")
        .eq("vehicle_id", id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data as NfcTag[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  const onRefresh = useCallback(async () => {
    try {
      await refetch();
    } catch {
      // ponytail: swallow
    }
  }, [refetch]);

  if (isLoading || !vehicle) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const activeCerts = certificates.filter((c) => c.status === "active").length;
  const vehicleTitle = [vehicle.maker, vehicle.model].filter(Boolean).join(" ") || "車両";

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} />
      }
    >
      {/* ─── Vehicle Hero Card ─── */}
      <View style={styles.heroCard}>
        <View style={styles.heroIconContainer}>
          <Icon source="car" size={40} color={colors.primary} />
        </View>
        <Text style={styles.heroTitle}>{vehicleTitle}</Text>
        <Text style={styles.heroPlate}>
          {vehicle.plate_display ?? "ナンバー未登録"}
        </Text>
        {vehicle.year && (
          <Text style={styles.heroYear}>{vehicle.year}年式</Text>
        )}
        {vehicle.customer_name && (
          <Pressable
            style={styles.ownerRow}
            onPress={() =>
              vehicle.customer_id &&
              router.push(`/customers/${vehicle.customer_id}`)
            }
          >
            <Icon source="account-outline" size={16} color={colors.primary} />
            <Text style={styles.ownerText}>{vehicle.customer_name}</Text>
          </Pressable>
        )}
      </View>

      {/* ─── Stat Cards Grid (ref 05) ─── */}
      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Icon source="history" size={24} color={colors.primary} />
          <Text style={styles.statValue}>{certificates.length}</Text>
          <Text style={styles.statLabel}>施工履歴</Text>
        </View>
        <View style={styles.statCard}>
          <Icon source="nfc" size={24} color={colors.info} />
          <Text style={styles.statValue}>{nfcTags.length}</Text>
          <Text style={styles.statLabel}>NFCタグ</Text>
        </View>
        <View style={styles.statCard}>
          <Icon source="certificate-outline" size={24} color={colors.success} />
          <Text style={styles.statValue}>{activeCerts}</Text>
          <Text style={styles.statLabel}>有効証明書</Text>
        </View>
        <View style={styles.statCard}>
          <Icon source="image-multiple-outline" size={24} color={colors.warning} />
          <Text style={styles.statValue}>—</Text>
          <Text style={styles.statLabel}>写真</Text>
        </View>
      </View>

      {/* ─── Certificate History (ref 05: recent history timeline) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>証明書履歴</Text>
        {certificates.length > 0 ? (
          certificates.map((cert) => {
            const cfg = CERT_STATUS_MAP[cert.status] ?? {
              label: cert.status,
              severity: "neutral" as const,
            };
            return (
              <Pressable
                key={cert.id}
                style={styles.listCard}
                onPress={() => router.push(`/certificates/${cert.id}`)}
                accessibilityRole="button"
              >
                <View style={styles.listCardInner}>
                  <View style={styles.timelineDot} />
                  <View style={styles.listCardContent}>
                    <Text style={styles.certNo}>{cert.certificate_no}</Text>
                    <Text style={styles.certMeta} numberOfLines={1}>
                      {[cert.service_type, cert.issued_date]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  <StatusBadge
                    label={cfg.label}
                    severity={cfg.severity}
                    compact
                  />
                </View>
              </Pressable>
            );
          })
        ) : (
          <Text style={styles.emptyText}>証明書はありません</Text>
        )}
      </View>

      {/* ─── NFC Tags ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>NFCタグ</Text>
        {nfcTags.length > 0 ? (
          nfcTags.map((tag) => {
            const cfg = NFC_STATUS_MAP[tag.status] ?? {
              label: tag.status,
              severity: "neutral" as const,
            };
            return (
              <View key={tag.id} style={styles.listCard}>
                <View style={styles.listCardInner}>
                  <View style={styles.nfcIcon}>
                    <Icon source="nfc" size={16} color={colors.info} />
                  </View>
                  <View style={styles.listCardContent}>
                    <Text style={styles.certNo}>{tag.tag_code}</Text>
                    {tag.uid && (
                      <Text style={styles.certMeta}>UID: {tag.uid}</Text>
                    )}
                  </View>
                  <StatusBadge
                    label={cfg.label}
                    severity={cfg.severity}
                    compact
                  />
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>NFCタグはありません</Text>
        )}
      </View>

      {/* Bottom padding */}
      <View style={{ height: spacing["3xl"] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Hero
  heroCard: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    borderRadius: radius.hero,
    padding: spacing["2xl"],
    alignItems: "center",
    ...shadows.card,
  },
  heroIconContainer: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  heroTitle: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  heroPlate: {
    ...typography.titleMedium,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  heroYear: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.full,
  },
  ownerText: {
    ...typography.labelSmall,
    color: colors.primary,
  },

  // Stat grid (2x2)
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: "center",
    width: "47%",
    flexGrow: 1,
    ...shadows.card,
  },
  statValue: {
    ...typography.titleLarge,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  statLabel: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },

  // List cards
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  listCardInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  nfcIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.infoLight,
    alignItems: "center",
    justifyContent: "center",
  },
  listCardContent: { flex: 1 },
  certNo: {
    ...typography.label,
    color: colors.textPrimary,
  },
  certMeta: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: 2,
  },

  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
});
