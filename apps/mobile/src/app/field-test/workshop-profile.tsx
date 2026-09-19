import { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Alert, Switch } from "react-native";
import { Text, Button, TextInput } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { colors, spacing, radius, shadows, typography } from "@/constants/tokens";

type Profile = {
  permits: { type: string; number?: string; expires_at?: string }[];
  mechanic_certifications: { grade: string; holder_name?: string; cert_number?: string }[];
  has_lift: boolean;
  has_diagnostic_tools: boolean;
  has_adas_equipment: boolean;
  equipment_notes: string | null;
  ev_capable: boolean;
  body_work: boolean;
  painting: boolean;
  coating: boolean;
  ppf: boolean;
  electrical: boolean;
  mobile_service: boolean;
  supported_vehicles: string[];
  service_area: { prefectures?: string[]; radius_km?: number; notes?: string };
  verified_at: string | null;
};

const EMPTY: Profile = {
  permits: [], mechanic_certifications: [],
  has_lift: false, has_diagnostic_tools: false, has_adas_equipment: false, equipment_notes: null,
  ev_capable: false, body_work: false, painting: false, coating: false, ppf: false, electrical: false, mobile_service: false,
  supported_vehicles: [], service_area: {}, verified_at: null,
};

const EQUIP: { key: keyof Profile; label: string }[] = [
  { key: "has_lift", label: "リフト" },
  { key: "has_diagnostic_tools", label: "診断機" },
  { key: "has_adas_equipment", label: "ADAS設備" },
];

const CAPS: { key: keyof Profile; label: string }[] = [
  { key: "ev_capable", label: "EV対応" },
  { key: "body_work", label: "鈑金" },
  { key: "painting", label: "塗装" },
  { key: "coating", label: "コーティング" },
  { key: "ppf", label: "PPF" },
  { key: "electrical", label: "電装" },
  { key: "mobile_service", label: "出張対応" },
];

export default function WorkshopProfileScreen() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const qk = ["workshop-profile", user?.tenantId];

  const { data, isLoading, refetch } = useQuery({
    queryKey: qk,
    queryFn: () => mobileApi<{ profile: Profile | null }>("/field-test/workshop-profile"),
    enabled: !!user?.tenantId,
  });

  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (data?.profile && !initialized) {
    setProfile(data.profile);
    setInitialized(true);
  }
  if (!initialized && !isLoading && !data?.profile) {
    setProfile(EMPTY);
    setInitialized(true);
  }

  const p = profile ?? EMPTY;

  const toggle = (key: keyof Profile) => {
    setProfile((prev) => ({ ...(prev ?? EMPTY), [key]: !((prev ?? EMPTY)[key]) }));
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await mobileApi<{ profile: Profile }>("/field-test/workshop-profile", {
        method: "PUT",
        body: profile,
      });
      setProfile(res.profile);
      queryClient.invalidateQueries({ queryKey: qk });
      Alert.alert("完了", "保存しました");
    } catch (e) {
      Alert.alert("エラー", e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => { setInitialized(false); refetch(); }} />}
    >
      {p.verified_at && (
        <View style={styles.verifiedBadge}>
          <Text style={styles.verifiedText}>認証済 ({p.verified_at.slice(0, 10)})</Text>
        </View>
      )}

      {/* Equipment */}
      <Text style={styles.sectionTitle}>設備</Text>
      <View style={styles.card}>
        {EQUIP.map(({ key, label }) => (
          <View key={key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch value={!!p[key]} onValueChange={() => toggle(key)} trackColor={{ true: colors.primary }} />
          </View>
        ))}
        <TextInput
          mode="outlined"
          label="設備メモ"
          value={p.equipment_notes ?? ""}
          onChangeText={(t) => setProfile((prev) => ({ ...(prev ?? EMPTY), equipment_notes: t || null }))}
          style={styles.input}
          dense
        />
      </View>

      {/* Capabilities */}
      <Text style={styles.sectionTitle}>対応サービス</Text>
      <View style={styles.card}>
        {CAPS.map(({ key, label }) => (
          <View key={key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch value={!!p[key]} onValueChange={() => toggle(key)} trackColor={{ true: colors.primary }} />
          </View>
        ))}
      </View>

      {/* Supported Vehicles */}
      <Text style={styles.sectionTitle}>対応車種</Text>
      <View style={styles.card}>
        <TextInput
          mode="outlined"
          label="カンマ区切りで入力"
          value={(p.supported_vehicles ?? []).join(", ")}
          onChangeText={(t) => setProfile((prev) => ({
            ...(prev ?? EMPTY),
            supported_vehicles: t.split(",").map((s) => s.trim()).filter(Boolean),
          }))}
          style={styles.input}
          dense
        />
      </View>

      {/* Service Area */}
      <Text style={styles.sectionTitle}>対応エリア</Text>
      <View style={styles.card}>
        <TextInput
          mode="outlined"
          label="都道府県（カンマ区切り）"
          value={(p.service_area?.prefectures ?? []).join(", ")}
          onChangeText={(t) => setProfile((prev) => ({
            ...(prev ?? EMPTY),
            service_area: { ...(prev ?? EMPTY).service_area, prefectures: t.split(",").map((s) => s.trim()).filter(Boolean) },
          }))}
          style={styles.input}
          dense
        />
        <TextInput
          mode="outlined"
          label="対応半径 (km)"
          keyboardType="numeric"
          value={p.service_area?.radius_km?.toString() ?? ""}
          onChangeText={(t) => setProfile((prev) => ({
            ...(prev ?? EMPTY),
            service_area: { ...(prev ?? EMPTY).service_area, radius_km: t ? Number(t) : undefined },
          }))}
          style={styles.input}
          dense
        />
      </View>

      {/* Save */}
      <Button
        mode="contained"
        onPress={handleSave}
        loading={saving}
        disabled={saving}
        style={styles.saveBtn}
      >
        保存する
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 80 },
  verifiedBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#dcfce7", borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    marginBottom: spacing.md,
  },
  verifiedText: { ...typography.meta, color: "#166534", fontSize: 11 },
  sectionTitle: { ...typography.titleSmall, color: colors.textPrimary, marginBottom: spacing.sm, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card,
    padding: spacing.md, ...shadows.card,
  },
  switchRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  switchLabel: { ...typography.bodySmall, color: colors.textPrimary },
  input: { backgroundColor: colors.surface, marginTop: spacing.xs },
  saveBtn: { marginTop: spacing.lg, borderRadius: radius.md },
});
