import { useState } from "react";
import { View, ScrollView, StyleSheet, Share } from "react-native";
import { Text, ActivityIndicator, Dialog, Portal, Snackbar, Icon } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton, StatusBadge } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Customer {
  id: string;
  name: string;
  name_kana: string | null;
  email: string | null;
  phone: string | null;
  postal_code: string | null;
  address: string | null;
  note: string | null;
}

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  year: number | null;
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const [intakeBusy, setIntakeBusy] = useState(false);
  const [intake, setIntake] = useState<{ url: string; expires_at: string } | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, name_kana, email, phone, postal_code, address, note")
        .eq("id", id)
        .eq("tenant_id", user!.tenantId)
        .single();
      if (error) throw error;
      return data as Customer;
    },
    enabled: !!id && !!user?.tenantId,
  });

  const { data: vehicles } = useQuery({
    queryKey: ["customer-vehicles", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, plate_display, maker, model, year")
        .eq("customer_id", id)
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Vehicle[];
    },
    enabled: !!id && !!user?.tenantId,
  });

  if (isLoading || !customer) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Customer info card */}
      <View style={styles.card}>
        <Text style={styles.heading}>{customer.name}</Text>
        {customer.name_kana && (
          <Text style={styles.kana}>{customer.name_kana}</Text>
        )}

        <View style={styles.divider} />

        <InfoRow label="メール" value={customer.email} />
        <InfoRow label="電話" value={customer.phone} />
        <InfoRow label="郵便番号" value={customer.postal_code} />
        <InfoRow label="住所" value={customer.address} />
        {customer.note && (
          <>
            <Text style={styles.label}>メモ</Text>
            <Text style={styles.note}>{customer.note}</Text>
          </>
        )}
      </View>

      {/* Vehicles section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>登録車両</Text>
        {vehicles && vehicles.length > 0 ? (
          vehicles.map((v) => (
            <View
              key={v.id}
              style={styles.vehicleCard}
              accessible
              accessibilityRole="button"
            >
              <View style={styles.vehicleRow}>
                <View style={styles.vehicleIconWrap}>
                  <Icon source="car" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleTitle}>
                    {v.maker} {v.model}
                  </Text>
                  <Text style={styles.sub}>
                    {v.plate_display} {v.year ? `(${v.year})` : ""}
                  </Text>
                </View>
                <LedraButton
                  variant="ghost"
                  size="small"
                  fullWidth={false}
                  onPress={() => router.push(`/vehicles/${v.id}`)}
                >
                  詳細
                </LedraButton>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>登録車両はありません</Text>
        )}
      </View>

      <View style={styles.buttonArea}>
        <LedraButton
          variant="outline"
          icon="qrcode"
          loading={intakeBusy}
          disabled={intakeBusy}
          onPress={async () => {
            setIntakeBusy(true);
            try {
              const { data: sessionData } = await supabase.auth.getSession();
              const token = sessionData?.session?.access_token;
              if (!token) {
                setSnackbar("認証セッションがありません");
                return;
              }
              const apiBase = process.env.EXPO_PUBLIC_API_URL!;
              const baseRoot = apiBase.replace(/\/api\/mobile\/?$/, "");
              const res = await fetch(`${baseRoot}/api/mobile/customer-intakes`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  label: `${customer.name} 様 事前カルテ`,
                  contact_email: customer.email,
                  contact_phone: customer.phone,
                }),
              });
              const j = await res.json().catch(() => null);
              if (!res.ok || !j?.ok) {
                setSnackbar(j?.error?.message ?? "発行に失敗しました");
                return;
              }
              setIntake({ url: j.url, expires_at: j.expires_at });
            } catch (e) {
              setSnackbar(e instanceof Error ? e.message : "通信エラー");
            } finally {
              setIntakeBusy(false);
            }
          }}
        >
          事前カルテURL発行
        </LedraButton>

        <LedraButton
          onPress={() => router.push(`/customers/edit/${id}`)}
          style={styles.editButton}
        >
          編集
        </LedraButton>
      </View>

      <Portal>
        <Dialog
          visible={!!intake}
          onDismiss={() => setIntake(null)}
          style={styles.dialog}
        >
          <Dialog.Icon icon="link-variant" color={colors.primary} />
          <Dialog.Title style={styles.dialogTitle}>
            事前カルテURLを発行しました
          </Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogHint}>
              このURLを顧客に共有してください。期限: {intake?.expires_at?.slice(0, 10)}
            </Text>
            <Text selectable style={styles.dialogUrl}>
              {intake?.url}
            </Text>
            <Text style={styles.dialogWarning}>
              ※ このURLは今だけ表示されます。閉じると再表示できません。
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <LedraButton
              variant="ghost"
              size="small"
              fullWidth={false}
              onPress={() => setIntake(null)}
            >
              閉じる
            </LedraButton>
            <LedraButton
              size="small"
              fullWidth={false}
              onPress={async () => {
                if (!intake) return;
                try {
                  await Share.share({
                    message: `事前カルテのご入力をお願いします:\n${intake.url}`,
                    url: intake.url,
                  });
                } catch {
                  // share キャンセルは無視
                }
              }}
            >
              共有
            </LedraButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbar ?? ""}
      </Snackbar>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    margin: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  kana: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  infoRow: { marginBottom: spacing.sm },
  label: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  note: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  section: { padding: spacing.md },
  sectionTitle: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  vehicleCard: {
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  vehicleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  vehicleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
  },
  vehicleTitle: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  sub: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  empty: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: spacing.lg,
  },
  buttonArea: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  editButton: { marginBottom: spacing["3xl"] },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.card },
  dialogTitle: {
    ...typography.titleMedium,
    textAlign: "center",
    color: colors.textPrimary,
  },
  dialogHint: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  dialogUrl: {
    ...typography.bodySmall,
    backgroundColor: colors.surfaceVariant,
    padding: spacing.sm,
    borderRadius: radius.sm,
    color: colors.textPrimary,
  },
  dialogWarning: {
    ...typography.bodySmall,
    color: colors.dangerDark,
    marginTop: spacing.sm,
  },
  snackbar: { backgroundColor: colors.textPrimary },
});
