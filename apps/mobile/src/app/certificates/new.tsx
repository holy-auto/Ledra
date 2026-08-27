import { useState, useEffect, useRef } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, HelperText, Menu, Chip } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { mobileApi } from "@/lib/api";
import { parseMileageKm } from "@/lib/mileage";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius } from "@/constants/tokens";

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  customers: { id: string; name: string | null } | null;
}

const SERVICE_TYPES = [
  "車検",
  "12ヶ月点検",
  "一般整備",
  "板金塗装",
  "コーティング",
  "その他",
];

export default function CertificateNewScreen() {
  const { user, selectedStore } = useAuthStore();
  const { reservationId } = useLocalSearchParams<{ reservationId?: string }>();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    customer_name: "",
    vehicle_id: "",
    vehicle_maker: "",
    vehicle_model: "",
    vehicle_plate: "",
    service_type: "",
    mileage_km: "",
    content_summary: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vehicleMenuVisible, setVehicleMenuVisible] = useState(false);
  const [serviceMenuVisible, setServiceMenuVisible] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  // 「この画面で作る1枚」を表す鍵。失敗して押し直しても同じ鍵を送るので、
  // サーバ側で重複が弾かれる。成功したら画面を離れるので使い回しの心配は無い
  const idemKeyRef = useRef(`cert-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  // Load vehicles for picker
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-picker", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        // vehicles に customer_name 列は無い。顧客名は customers を埋め込む
        .select("id, plate_display, maker, model, customers ( id, name )")
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as unknown as Vehicle[];
    },
    enabled: !!user?.tenantId,
  });

  // If reservationId provided, load reservation to pre-fill vehicle
  const tenantId = user?.tenantId;
  useEffect(() => {
    if (!reservationId || !tenantId) return;

    async function loadReservation() {
      const { data } = await supabase
        .from("reservations")
        .select("vehicle_id")
        .eq("id", reservationId)
        .eq("tenant_id", tenantId!)
        .single();

      if (data?.vehicle_id) {
        setForm((prev) => ({ ...prev, vehicle_id: data.vehicle_id }));

        const { data: v } = await supabase
          .from("vehicles")
          // vehicles に customer_name 列は無い。顧客名は customers を埋め込む
        .select("id, plate_display, maker, model, customers ( id, name )")
          .eq("id", data.vehicle_id)
          .single();

        if (v) {
          const vehicle = v as unknown as Vehicle;
          setSelectedVehicle(vehicle);
          setForm((prev) => ({
            ...prev,
            // 顧客名はサーバ側で必須。車両の所有者が分かれば埋めておく
            customer_name: prev.customer_name || (vehicle.customers?.name ?? ""),
            vehicle_id: vehicle.id,
            vehicle_maker: vehicle.maker ?? "",
            vehicle_model: vehicle.model ?? "",
            vehicle_plate: vehicle.plate_display ?? "",
          }));
        }
      }
    }

    loadReservation();
  }, [reservationId, tenantId]);

  const mutation = useMutation({
    mutationFn: async () => {
      // 直接 insert すると、テンプレートのスキーマ写し取り・メーカー認定テンプレートの
      // 検証・撮影来歴の nonce 発行・車両履歴の記録を**全部飛ばす**。
      // Web の発行画面と同じ処理を通すため、必ずサーバ経由で作る
      return mobileApi<{ id: string | null; public_id: string }>("/certificates", {
        method: "POST",
        // 送信のたびに1つ決めて、同じ操作の再送では同じ鍵を送る。
        // 鍵が無いとサーバの冪等ラッパーが素通りし、再送で証明書が2枚できる
        headers: { "Idempotency-Key": idemKeyRef.current },
        body: {
          // **案件から来たら必ず送る。** これが無いと証明書が予約に紐づかず、
          // 作業詳細の「施工写真を撮影」が予約IDで証明書を探しても永久に0件になる
          // （本番の証明書45件すべて reservation_id が null だった）。
          // 画面は reservationId を車両の事前入力にだけ使っていて、送っていなかった
          reservation_id: reservationId ?? null,
          customer_name: form.customer_name.trim(),
          // 顧客 ID を渡すと、サーバ側の「名前で似た顧客を探す」経路を通らずに済む。
          // 同名の別人に紐付く事故と、顧客表の全件読み込みを両方避けられる
          customer_id: selectedVehicle?.customers?.id ?? null,
          store_id: selectedStore?.id ?? null,
          vehicle_id: form.vehicle_id || null,
          vehicle_maker: form.vehicle_maker.trim(),
          model: form.vehicle_model.trim(),
          plate: form.vehicle_plate.trim(),
          service_type: form.service_type || null,
          // サーバ (certCreateJsonSchema → createCertificate) が必須にしている。
          // 走行距離は vehicle_mileage_logs のタイムラインになる。
          mileage_km: parseMileageKm(form.mileage_km),
          content_free_text:
            [form.content_summary.trim(), form.notes.trim()].filter(Boolean).join("\n\n"),
        },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      // 詳細画面は id（uuid）で引く。取れなければ一覧へ戻す
      if (data.id) router.replace(`/certificates/${data.id}`);
      else router.replace("/(tabs)/certificates");
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    // Allow either vehicle_id (master) or manual maker/model entry
    if (!form.vehicle_id && !form.vehicle_maker.trim() && !form.vehicle_model.trim()) {
      e.vehicle = "車両を選択するか、メーカー・車種を入力してください";
    }
    // サーバ側（certCreateJsonSchema）で必須。ここで止めないと 400 になるだけで
    // 画面から入力する手段が無くなる
    if (!form.customer_name.trim()) e.customer_name = "顧客名を入力してください";
    if (!form.service_type) e.service_type = "サービス種別を選択してください";
    if (parseMileageKm(form.mileage_km) === null) {
      e.mileage_km = "走行距離（km）を入力してください（1以上の整数）";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    mutation.mutate();
  }

  function selectVehicle(v: Vehicle) {
    setSelectedVehicle(v);
    setForm((prev) => ({
      ...prev,
      // 未入力なら車両の所有者名を入れる。既に打ってあれば尊重する
      customer_name: prev.customer_name || (v.customers?.name ?? ""),
      vehicle_id: v.id,
      vehicle_maker: v.maker ?? "",
      vehicle_model: v.model ?? "",
      vehicle_plate: v.plate_display ?? "",
    }));
    setVehicleMenuVisible(false);
    if (errors.vehicle) setErrors((prev) => ({ ...prev, vehicle: "" }));
  }

  function clearVehicleLink() {
    setSelectedVehicle(null);
    setForm((prev) => ({ ...prev, vehicle_id: "" }));
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        {/* Vehicle Picker (optional — select from master) */}
        <Menu
          visible={vehicleMenuVisible}
          onDismiss={() => setVehicleMenuVisible(false)}
          anchor={
            <TextInput
              label="車両マスタから選択（任意）"
              value={
                selectedVehicle
                  ? `${selectedVehicle.maker ?? ""} ${selectedVehicle.model ?? ""} (${selectedVehicle.plate_display ?? ""})`
                  : ""
              }
              mode="outlined"
              editable={false}
              onPressIn={() => setVehicleMenuVisible(true)}
              right={<TextInput.Icon icon="chevron-down" />}
              style={styles.input}
            />
          }
          anchorPosition="bottom"
          style={styles.menu}
        >
          {vehicles?.map((v) => (
            <Menu.Item
              key={v.id}
              title={`${v.maker ?? ""} ${v.model ?? ""} (${v.plate_display ?? ""})`}
              onPress={() => selectVehicle(v)}
            />
          ))}
        </Menu>
        {selectedVehicle && (
          <Chip
            icon="link"
            onClose={clearVehicleLink}
            style={styles.chip}
            textStyle={styles.chipText}
          >
            マスタ連携中
          </Chip>
        )}

        <TextInput
          label="顧客名 *"
          value={form.customer_name}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, customer_name: v }));
            if (errors.customer_name) setErrors((prev) => ({ ...prev, customer_name: "" }));
          }}
          mode="outlined"
          style={styles.input}
        />
        {errors.customer_name && <HelperText type="error">{errors.customer_name}</HelperText>}

        {/* Manual vehicle entry fields */}
        <TextInput
          label="メーカー *"
          value={form.vehicle_maker}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, vehicle_maker: v, vehicle_id: "" }));
            setSelectedVehicle(null);
            if (errors.vehicle) setErrors((prev) => ({ ...prev, vehicle: "" }));
          }}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="車種"
          value={form.vehicle_model}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, vehicle_model: v, vehicle_id: "" }));
            setSelectedVehicle(null);
          }}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="ナンバー"
          value={form.vehicle_plate}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, vehicle_plate: v, vehicle_id: "" }));
            setSelectedVehicle(null);
          }}
          mode="outlined"
          style={styles.input}
        />
        {errors.vehicle && (
          <HelperText type="error">{errors.vehicle}</HelperText>
        )}

        {/* Service Type Picker */}
        <Menu
          visible={serviceMenuVisible}
          onDismiss={() => setServiceMenuVisible(false)}
          anchor={
            <TextInput
              label="サービス種別 *"
              value={form.service_type}
              mode="outlined"
              editable={false}
              onPressIn={() => setServiceMenuVisible(true)}
              right={<TextInput.Icon icon="chevron-down" />}
              error={!!errors.service_type}
              style={styles.input}
            />
          }
          anchorPosition="bottom"
        >
          {SERVICE_TYPES.map((type) => (
            <Menu.Item
              key={type}
              title={type}
              onPress={() => {
                setForm((prev) => ({ ...prev, service_type: type }));
                setServiceMenuVisible(false);
                if (errors.service_type)
                  setErrors((prev) => ({ ...prev, service_type: "" }));
              }}
            />
          ))}
        </Menu>
        {errors.service_type && (
          <HelperText type="error">{errors.service_type}</HelperText>
        )}

        <TextInput
          label="走行距離（km）*"
          value={form.mileage_km}
          onChangeText={(v) => {
            setForm((prev) => ({ ...prev, mileage_km: v }));
            if (errors.mileage_km) setErrors((prev) => ({ ...prev, mileage_km: "" }));
          }}
          mode="outlined"
          keyboardType="number-pad"
          placeholder="例: 35000"
          error={!!errors.mileage_km}
          style={styles.input}
        />
        {errors.mileage_km && <HelperText type="error">{errors.mileage_km}</HelperText>}

        <TextInput
          label="作業内容"
          value={form.content_summary}
          onChangeText={(v) =>
            setForm((prev) => ({ ...prev, content_summary: v }))
          }
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
        />

        <TextInput
          label="備考"
          value={form.notes}
          onChangeText={(v) => setForm((prev) => ({ ...prev, notes: v }))}
          mode="outlined"
          multiline
          numberOfLines={2}
          style={styles.input}
        />

        <LedraButton
          onPress={handleSubmit}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          style={styles.button}
        >
          下書き保存
        </LedraButton>

        {mutation.isError && (
          <HelperText type="error" style={styles.errorText}>
            作成に失敗しました: {mutation.error.message}
          </HelperText>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  form: { padding: spacing.lg },
  input: { marginBottom: spacing.sm, backgroundColor: colors.surface },
  menu: { maxHeight: 300 },
  button: { marginTop: spacing.lg },
  errorText: { marginTop: spacing.sm },
  chip: {
    marginBottom: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.primaryLight,
  },
  chipText: { fontSize: 12, color: colors.primaryDark },
});
