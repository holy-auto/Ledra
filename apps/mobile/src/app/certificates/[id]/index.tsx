import { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Image,
  Alert,
  Pressable,
} from "react-native";
import {
  Text,
  Icon,
  ActivityIndicator,
  Dialog,
  Portal,
  TextInput,
  IconButton,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as MediaLibrary from "expo-media-library";
import { File, Paths } from "expo-file-system";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { StatusBadge, LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

/** certificate_images row */
interface CertImage {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  medium_path: string | null;
  stage: string | null;
  authenticity_grade: string | null;
}

function assetUrl(path: string): string {
  return supabase.storage.from("assets").getPublicUrl(path).data.publicUrl;
}

interface CertificateDetail {
  id: string;
  certificate_no: string;
  public_id: string | null;
  status: string;
  service_type: string | null;
  content: Record<string, unknown> | null;
  customer_name: string | null;
  customer_id: string | null;
  vehicle_id: string | null;
  vehicle_maker: string | null;
  vehicle_model: string | null;
  plate_display: string | null;
  issued_date: string | null;
  expiry_date: string | null;
}

interface NfcTag {
  id: string;
  tag_code: string;
  uid: string | null;
  status: string;
}

const CERT_STATUS_MAP: Record<
  string,
  { label: string; severity: "success" | "warning" | "danger" | "neutral" | "info" }
> = {
  active: { label: "VERIFIED", severity: "success" },
  draft: { label: "下書き", severity: "neutral" },
  void: { label: "無効", severity: "danger" },
  expired: { label: "期限切", severity: "warning" },
};

const STAGE_MAP: Record<string, { label: string; severity: "info" | "warning" | "success" | "neutral" }> = {
  intake_before: { label: "施工前", severity: "info" },
  in_progress: { label: "作業中", severity: "warning" },
  after: { label: "施工後", severity: "success" },
  unspecified: { label: "未指定", severity: "neutral" },
};

const GRADE_MAP: Record<string, { label: string; severity: "success" | "info" | "neutral" | "danger" }> = {
  verified: { label: "担保", severity: "success" },
  sealed: { label: "封印", severity: "info" },
  basic: { label: "基本", severity: "neutral" },
  unverified: { label: "未検証", severity: "danger" },
};

export default function CertificateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [voidDialogVisible, setVoidDialogVisible] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [snackbar, setSnackbar] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: cert, isLoading } = useQuery({
    queryKey: ["certificate", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select(
          "id, certificate_no, public_id, status, service_type, content, customer_name, customer_id, vehicle_id, vehicle_maker, vehicle_model, plate_display, issued_date, expiry_date"
        )
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as CertificateDetail;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: images = [] } = useQuery({
    queryKey: ["certificate-images", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_images")
        .select(
          "id, storage_path, thumbnail_path, medium_path, stage, authenticity_grade"
        )
        .eq("certificate_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as CertImage[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  async function saveToDevice(img: CertImage) {
    setSavingId(img.id);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        Alert.alert("権限エラー", "写真を端末に保存する権限を許可してください");
        return;
      }
      const url = assetUrl(img.storage_path);
      const ext = img.storage_path.split(".").pop()?.split("?")[0] ?? "jpg";
      const dest = new File(Paths.cache, `cert-${img.id}.${ext}`);
      const dl = await File.downloadFileAsync(url, dest, { idempotent: true });
      await MediaLibrary.saveToLibraryAsync(dl.uri);
      dl.delete();
      setSnackbar("端末に保存しました");
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSavingId(null);
    }
  }

  const { data: nfcTags = [] } = useQuery({
    queryKey: ["certificate-nfc-tags", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfc_tags")
        .select("id, tag_code, uid, status")
        .eq("certificate_id", id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
      return data as NfcTag[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  const activateMutation = useMutation({
    mutationFn: () =>
      mobileApi(`/certificates/${id}/activate`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificate", id] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) =>
      mobileApi(`/certificates/${id}/void`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => {
      setVoidDialogVisible(false);
      setVoidReason("");
      queryClient.invalidateQueries({ queryKey: ["certificate", id] });
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  if (isLoading || !cert) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const statusCfg = CERT_STATUS_MAP[cert.status] ?? {
    label: cert.status,
    severity: "neutral" as const,
  };
  const vehicleText = [cert.vehicle_maker, cert.vehicle_model, cert.plate_display]
    .filter(Boolean)
    .join(" ");

  return (
    <ScrollView style={styles.container}>
      {/* ─── Status Hero (ref 04: VERIFIED shield badge) ─── */}
      <View style={styles.statusHero}>
        <View
          style={[
            styles.shieldContainer,
            {
              backgroundColor:
                cert.status === "active"
                  ? colors.successLight
                  : colors.surfaceVariant,
            },
          ]}
        >
          <Icon
            source="shield-check"
            size={48}
            color={
              cert.status === "active" ? colors.success : colors.textTertiary
            }
          />
        </View>
        <StatusBadge label={statusCfg.label} severity={statusCfg.severity} />
        <Text style={styles.certNo}>{cert.certificate_no}</Text>
        {cert.issued_date && (
          <Text style={styles.issuedDate}>発行日: {cert.issued_date}</Text>
        )}
      </View>

      {/* ─── Vehicle Info Card ─── */}
      {vehicleText ? (
        <Pressable
          style={styles.infoCard}
          onPress={() =>
            cert.vehicle_id && router.push(`/vehicles/${cert.vehicle_id}`)
          }
        >
          <View style={styles.infoCardIcon}>
            <Icon source="car" size={20} color={colors.primary} />
          </View>
          <View style={styles.infoCardContent}>
            <Text style={styles.infoCardTitle}>車両情報</Text>
            <Text style={styles.infoCardValue}>{vehicleText}</Text>
          </View>
          <Icon source="chevron-right" size={20} color={colors.textTertiary} />
        </Pressable>
      ) : null}

      {/* ─── 作業概要 Section (ref 04) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>作業概要</Text>
        <View style={styles.sectionCard}>
          <InfoRow icon="wrench" label="サービス" value={cert.service_type} />
          <InfoRow icon="account" label="顧客" value={cert.customer_name} />
          <InfoRow icon="calendar" label="発行日" value={cert.issued_date} />
          <InfoRow icon="calendar-clock" label="有効期限" value={cert.expiry_date} />
        </View>
      </View>

      {/* ─── 完全性の検証 Section (ref 04: integrity checks) ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>完全性の検証</Text>
        <View style={styles.sectionCard}>
          <IntegrityRow
            icon="camera-sync"
            label="写真同期"
            verified={images.length > 0}
          />
          <IntegrityRow
            icon="nfc"
            label="NFCタグ"
            verified={nfcTags.length > 0}
          />
          <IntegrityRow
            icon="shield-check"
            label="証明書ステータス"
            verified={cert.status === "active"}
          />
        </View>
      </View>

      {/* ─── Images Section ─── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            施工写真 ({images.length})
          </Text>
          <Pressable
            style={styles.photoAddBtn}
            onPress={() => router.push(`/certificates/${cert.id}/photos`)}
          >
            <Icon source="camera-plus" size={18} color={colors.primary} />
            <Text style={styles.photoAddText}>撮影</Text>
          </Pressable>
        </View>
        {images.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.imageScroll}
          >
            {images.map((img) => {
              const stageCfg = img.stage
                ? STAGE_MAP[img.stage] ?? STAGE_MAP.unspecified
                : null;
              const gradeCfg = img.authenticity_grade
                ? GRADE_MAP[img.authenticity_grade]
                : null;

              return (
                <View key={img.id} style={styles.imageCard}>
                  <Image
                    source={{
                      uri: assetUrl(img.thumbnail_path ?? img.storage_path),
                    }}
                    style={styles.image}
                    resizeMode="cover"
                    accessibilityLabel={`証明書画像 (${img.stage ?? "未指定"})`}
                  />
                  <View style={styles.imageBadges}>
                    {stageCfg && (
                      <StatusBadge
                        label={stageCfg.label}
                        severity={stageCfg.severity}
                        compact
                      />
                    )}
                    {gradeCfg && (
                      <StatusBadge
                        label={gradeCfg.label}
                        severity={gradeCfg.severity}
                        compact
                      />
                    )}
                  </View>
                  <IconButton
                    icon="download"
                    size={16}
                    mode="contained-tonal"
                    loading={savingId === img.id}
                    disabled={savingId === img.id}
                    onPress={() => saveToDevice(img)}
                    style={styles.saveBtn}
                    accessibilityLabel="端末に保存"
                  />
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>施工写真はありません</Text>
        )}
      </View>

      {/* ─── Action Buttons (ref 04: PDF/QRコード/共有) ─── */}
      <View style={styles.actionRow}>
        <ActionCard icon="file-pdf-box" label="PDF" onPress={() => {}} />
        <ActionCard icon="qrcode" label="QRコード" onPress={() => {}} />
        <ActionCard
          icon="share-variant"
          label="共有"
          onPress={() => {}}
        />
      </View>

      {/* ─── Status Actions ─── */}
      <View style={styles.statusActions}>
        {cert.status === "draft" && (
          <LedraButton
            variant="primary"
            onPress={() => activateMutation.mutate()}
            loading={activateMutation.isPending}
            icon="shield-check"
          >
            有効化
          </LedraButton>
        )}
        {cert.status === "active" && (
          <LedraButton
            variant="danger"
            onPress={() => setVoidDialogVisible(true)}
            icon="shield-off"
          >
            無効化
          </LedraButton>
        )}
        <LedraButton
          variant="secondary"
          onPress={() => router.push(`/nfc/write/${cert.id}`)}
          icon="nfc"
        >
          NFC書込
        </LedraButton>
      </View>

      {/* Void Dialog */}
      <Portal>
        <Dialog
          visible={voidDialogVisible}
          onDismiss={() => setVoidDialogVisible(false)}
        >
          <Dialog.Title>証明書を無効化</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="無効化理由"
              value={voidReason}
              onChangeText={setVoidReason}
              mode="outlined"
              multiline
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Pressable
              onPress={() => setVoidDialogVisible(false)}
              style={styles.dialogBtn}
            >
              <Text style={styles.dialogBtnText}>キャンセル</Text>
            </Pressable>
            <Pressable
              onPress={() => voidMutation.mutate(voidReason)}
              disabled={!voidReason.trim() || voidMutation.isPending}
              style={styles.dialogBtn}
            >
              <Text style={[styles.dialogBtnText, { color: colors.danger }]}>
                無効化
              </Text>
            </Pressable>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {(activateMutation.isError || voidMutation.isError) && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {activateMutation.error?.message ?? voidMutation.error?.message}
          </Text>
        </View>
      )}

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
        {snackbar}
      </Snackbar>

      <View style={{ height: spacing["3xl"] }} />
    </ScrollView>
  );
}

/* ─── Sub-components ─── */

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Icon source={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function IntegrityRow({
  icon,
  label,
  verified,
}: {
  icon: string;
  label: string;
  verified: boolean;
}) {
  return (
    <View style={styles.integrityRow}>
      <Icon source={icon} size={18} color={colors.textTertiary} />
      <Text style={styles.integrityLabel}>{label}</Text>
      <Icon
        source={verified ? "check-circle" : "close-circle"}
        size={20}
        color={verified ? colors.success : colors.textTertiary}
      />
    </View>
  );
}

function ActionCard({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.actionCard} onPress={onPress}>
      <Icon source={icon} size={24} color={colors.primary} />
      <Text style={styles.actionCardLabel}>{label}</Text>
    </Pressable>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Status hero
  statusHero: {
    backgroundColor: colors.surface,
    padding: spacing["2xl"],
    alignItems: "center",
    borderBottomLeftRadius: radius.hero,
    borderBottomRightRadius: radius.hero,
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  shieldContainer: {
    width: 80,
    height: 80,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  certNo: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  issuedDate: {
    ...typography.meta,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },

  // Info card
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
    marginBottom: spacing.lg,
  },
  infoCardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCardContent: { flex: 1 },
  infoCardTitle: {
    ...typography.meta,
    color: colors.textTertiary,
  },
  infoCardValue: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginTop: 2,
  },

  // Sections
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.card,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  infoLabel: {
    ...typography.meta,
    color: colors.textTertiary,
    width: 72,
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },

  // Integrity rows
  integrityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  integrityLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    flex: 1,
  },

  // Photos
  photoAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  photoAddText: {
    ...typography.label,
    color: colors.primary,
  },
  imageScroll: { gap: spacing.sm },
  imageCard: {
    position: "relative",
    borderRadius: radius.md,
    overflow: "hidden",
  },
  image: { width: 120, height: 120, borderRadius: radius.md },
  imageBadges: {
    flexDirection: "row",
    gap: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: "wrap",
    maxWidth: 120,
  },
  saveBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    margin: 0,
    backgroundColor: colors.surface,
  },

  // Action row (ref 04: PDF/QR/共有)
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
    ...shadows.card,
  },
  actionCardLabel: {
    ...typography.labelSmall,
    color: colors.textPrimary,
  },

  // Status actions
  statusActions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },

  // Dialog
  dialogBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dialogBtnText: {
    ...typography.label,
    color: colors.textPrimary,
  },

  // Misc
  emptyText: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    textAlign: "center",
    paddingVertical: spacing.xl,
  },
  errorContainer: { paddingHorizontal: spacing.lg },
  errorText: {
    ...typography.bodySmall,
    color: colors.danger,
    textAlign: "center",
  },
});
