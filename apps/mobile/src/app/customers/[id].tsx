import { useState } from "react";
import { View, ScrollView, StyleSheet, Share } from "react-native";
import { Text, Card, Button, Divider, ActivityIndicator, Chip, Dialog, Portal, Snackbar } from "react-native-paper";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card} mode="outlined">
        <Card.Content>
          <Text variant="headlineSmall" style={styles.heading}>
            {customer.name}
          </Text>
          {customer.name_kana && (
            <Text variant="bodyMedium" style={styles.kana}>
              {customer.name_kana}
            </Text>
          )}

          <Divider style={styles.divider} />

          <InfoRow label="メール" value={customer.email} />
          <InfoRow label="電話" value={customer.phone} />
          <InfoRow label="郵便番号" value={customer.postal_code} />
          <InfoRow label="住所" value={customer.address} />
          {customer.note && (
            <>
              <Text variant="labelMedium" style={styles.label}>
                メモ
              </Text>
              <Text variant="bodyMedium" style={styles.note}>
                {customer.note}
              </Text>
            </>
          )}
        </Card.Content>
      </Card>

      <View style={styles.section}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          登録車両
        </Text>
        {vehicles && vehicles.length > 0 ? (
          vehicles.map((v) => (
            <Card
              key={v.id}
              style={styles.vehicleCard}
              mode="outlined"
              onPress={() => router.push(`/vehicles/${v.id}`)}
            >
              <Card.Content style={styles.vehicleRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleSmall" style={styles.vehicleTitle}>
                    {v.maker} {v.model}
                  </Text>
                  <Text variant="bodySmall" style={styles.sub}>
                    {v.plate_display} {v.year ? `(${v.year})` : ""}
                  </Text>
                </View>
                <Chip compact>詳細</Chip>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Text style={styles.empty}>登録車両はありません</Text>
        )}
      </View>

      <Button
        mode="outlined"
        icon="qrcode"
        style={styles.intakeButton}
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
      </Button>

      <Button
        mode="contained"
        style={styles.editButton}
        buttonColor="#1a1a2e"
        onPress={() => router.push(`/customers/edit/${id}`)}
      >
        編集
      </Button>

      <Portal>
        <Dialog visible={!!intake} onDismiss={() => setIntake(null)}>
          <Dialog.Icon icon="link-variant" />
          <Dialog.Title style={{ textAlign: "center" }}>事前カルテURLを発行しました</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ color: "#666", marginBottom: 8 }}>
              このURLを顧客に共有してください。期限: {intake?.expires_at?.slice(0, 10)}
            </Text>
            <Text selectable variant="bodySmall" style={{ backgroundColor: "#f4f4f5", padding: 8, borderRadius: 6 }}>
              {intake?.url}
            </Text>
            <Text variant="bodySmall" style={{ color: "#a02525", marginTop: 8 }}>
              ※ このURLは今だけ表示されます。閉じると再表示できません。
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIntake(null)}>閉じる</Button>
            <Button
              mode="contained"
              buttonColor="#1a1a2e"
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
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={3000}>
        {snackbar ?? ""}
      </Snackbar>
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text variant="labelMedium" style={styles.label}>
        {label}
      </Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: { margin: 12, backgroundColor: "#ffffff" },
  heading: { fontWeight: "700", color: "#1a1a2e" },
  kana: { color: "#71717a", marginTop: 2 },
  divider: { marginVertical: 12 },
  infoRow: { marginBottom: 8 },
  label: { color: "#71717a", marginBottom: 2 },
  note: { color: "#3f3f46", backgroundColor: "#f4f4f5", padding: 8, borderRadius: 4 },
  section: { padding: 12 },
  sectionTitle: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  vehicleCard: { marginBottom: 8, backgroundColor: "#ffffff" },
  vehicleRow: { flexDirection: "row", alignItems: "center" },
  vehicleTitle: { fontWeight: "600", color: "#1a1a2e" },
  sub: { color: "#71717a", marginTop: 2 },
  empty: { color: "#71717a", textAlign: "center", marginTop: 16 },
  intakeButton: { marginHorizontal: 12, marginTop: 4 },
  editButton: { margin: 12, marginBottom: 32 },
});
