import { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput as RNTextInput,
  Pressable,
} from "react-native";
import {
  TextInput,
  HelperText,
  Text,
  List,
  ActivityIndicator,
  Snackbar,
  Icon,
} from "react-native-paper";
import { router, Stack } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
}

interface OcrResult {
  maker: string | null;
  model: string | null;
  year: number | null;
  vin_code: string | null;
  plate_display: string | null;
  size_class: string | null;
}

export default function VehicleNewScreen() {
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();
  const isPaidPlan = user?.planTier === "standard" || user?.planTier === "pro";

  const [form, setForm] = useState({
    maker: "",
    model: "",
    year: "",
    plate_display: "",
    vin_code: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 顧客選択
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState("");

  // 顧客検索
  const { data: customers = [], isFetching: searchingCustomers } = useQuery<Customer[]>({
    queryKey: ["customers-search-vehicle", customerSearch],
    queryFn: async () => {
      if (!customerSearch || customerSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("tenant_id", user!.tenantId)
        .ilike("name", `%${customerSearch}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: customerSearch.length >= 2 && !selectedCustomer,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          tenant_id: user!.tenantId,
          maker: form.maker.trim() || null,
          model: form.model.trim() || null,
          year: form.year.trim() ? parseInt(form.year.trim(), 10) : null,
          plate_display: form.plate_display.trim() || null,
          vin_code: form.vin_code.trim() || null,
          // vehicles に customer_name 列は無い。顧客は customer_id で紐付ける
          customer_id: selectedCustomer?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      router.replace(`/vehicles/${data.id}`);
    },
    onError: (err) => {
      setSnackbar(err instanceof Error ? err.message : "登録に失敗しました");
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.plate_display.trim()) e.plate_display = "ナンバーは必須です";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate();
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  async function handleOcrScan() {
    const permResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permResult.granted) {
      setSnackbar("カメラの使用を許可してください");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setOcrImage(asset.uri);
    setOcrLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        type: "image/jpeg",
        name: "shakken.jpg",
      } as unknown as Blob);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      const apiBase = process.env.EXPO_PUBLIC_API_URL!;
      const response = await fetch(
        `${apiBase.replace("/api/mobile", "")}/api/vehicles/parse-shakken`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );
      const res = (await response.json()) as { ok: boolean; extracted: OcrResult };

      if (res.ok && res.extracted) {
        const e = res.extracted;
        setForm((prev) => ({
          maker: e.maker ?? prev.maker,
          model: e.model ?? prev.model,
          year: e.year != null ? String(e.year) : prev.year,
          plate_display: e.plate_display ?? prev.plate_display,
          vin_code: e.vin_code ?? prev.vin_code,
        }));
        setSnackbar("車検証から情報を読み取りました");
      } else {
        setSnackbar("車検証を読み取れませんでした");
      }
    } catch (err) {
      setSnackbar(
        err instanceof Error ? err.message : "OCR処理に失敗しました",
      );
    } finally {
      setOcrLoading(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: "車両登録" }} />
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* 車検証OCR（有料プランのみ） */}
        {isPaidPlan && (
          <View style={styles.card}>
            <View style={styles.ocrHeader}>
              <Icon source="camera" size={20} color={colors.primary} />
              <Text style={styles.heading}>車検証スキャン</Text>
            </View>
            <Text style={styles.subText}>車検証を撮影して自動入力</Text>

            {ocrImage && (
              <Image
                source={{ uri: ocrImage }}
                style={styles.ocrPreview}
                resizeMode="cover"
              />
            )}

            <LedraButton
              variant="secondary"
              icon="camera"
              onPress={handleOcrScan}
              loading={ocrLoading}
              disabled={ocrLoading}
              style={styles.ocrButton}
            >
              {ocrLoading ? "読み取り中..." : "車検証を撮影"}
            </LedraButton>
          </View>
        )}

        {/* オーナー選択 */}
        <View style={styles.card}>
          <Text style={styles.heading}>オーナー</Text>
          {selectedCustomer ? (
            <View style={styles.selectedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedName}>
                  {selectedCustomer.name}
                </Text>
                {selectedCustomer.phone && (
                  <Text style={styles.subText}>
                    {selectedCustomer.phone}
                  </Text>
                )}
              </View>
              <LedraButton
                variant="ghost"
                size="small"
                fullWidth={false}
                onPress={() => {
                  setSelectedCustomer(null);
                  setCustomerSearch("");
                }}
              >
                変更
              </LedraButton>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Icon source="magnify" size={20} color={colors.textTertiary} />
                <RNTextInput
                  style={styles.searchInput}
                  placeholder="顧客名で検索..."
                  placeholderTextColor={colors.textTertiary}
                  value={customerSearch}
                  onChangeText={setCustomerSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {searchingCustomers && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>
              {customers.map((c) => (
                <List.Item
                  key={c.id}
                  title={c.name}
                  description={c.phone ?? ""}
                  onPress={() => {
                    setSelectedCustomer(c);
                    setCustomerSearch(c.name);
                  }}
                  left={(props) => <List.Icon {...props} icon="account" />}
                  titleStyle={{ color: colors.textPrimary }}
                  descriptionStyle={{ color: colors.textSecondary }}
                />
              ))}
              <Text style={[styles.subText, { marginTop: spacing.sm }]}>
                未選択の場合はオーナーなしで登録します
              </Text>
            </>
          )}
        </View>

        {/* 車両情報フォーム */}
        <View style={styles.card}>
          <Text style={styles.heading}>車両情報</Text>

          <TextInput
            label="メーカー"
            value={form.maker}
            onChangeText={(v) => update("maker", v)}
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="車種"
            value={form.model}
            onChangeText={(v) => update("model", v)}
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="年式"
            value={form.year}
            onChangeText={(v) => update("year", v)}
            mode="outlined"
            keyboardType="number-pad"
            style={styles.input}
          />

          <TextInput
            label="ナンバー *"
            value={form.plate_display}
            onChangeText={(v) => update("plate_display", v)}
            mode="outlined"
            error={!!errors.plate_display}
            style={styles.input}
          />
          {errors.plate_display && (
            <HelperText type="error">{errors.plate_display}</HelperText>
          )}

          <TextInput
            label="車台番号"
            value={form.vin_code}
            onChangeText={(v) => update("vin_code", v)}
            mode="outlined"
            style={styles.input}
          />
        </View>

        {/* 登録ボタン */}
        <View style={styles.submitArea}>
          <LedraButton
            onPress={handleSubmit}
            loading={mutation.isPending}
            disabled={mutation.isPending}
            icon="check"
          >
            登録する
          </LedraButton>
        </View>

        {mutation.isError && (
          <HelperText type="error" style={styles.errorText}>
            登録に失敗しました: {mutation.error.message}
          </HelperText>
        )}

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  heading: {
    ...typography.titleMedium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subText: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  ocrHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ocrPreview: {
    width: "100%",
    height: 160,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  ocrButton: { marginTop: spacing.sm },
  selectedRow: { flexDirection: "row", alignItems: "center" },
  selectedName: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    padding: 0,
  },
  input: { marginBottom: spacing.sm, backgroundColor: colors.surface },
  submitArea: { padding: spacing.lg },
  errorText: { marginHorizontal: spacing.lg },
  snackbar: { backgroundColor: colors.textPrimary },
});
