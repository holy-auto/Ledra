import { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, HelperText, Menu, Chip } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius } from "@/constants/tokens";

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  customers: { name: string | null } | null;
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
    vehicle_id: "",
    vehicle_maker: "",
    vehicle_model: "",
    vehicle_plate: "",
    service_type: "",
    content_summary: "",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vehicleMenuVisible, setVehicleMenuVisible] = useState(false);
  const [serviceMenuVisible, setServiceMenuVisible] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Load vehicles for picker
  const { data: vehicles } = useQuery({
    queryKey: ["vehicles-picker", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        // vehicles に customer_name 列は無い。顧客名は customers を埋め込む
        .select("id, plate_display, maker, model, customers ( name )")
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
        .select("id, plate_display, maker, model, customers ( name )")
          .eq("id", data.vehicle_id)
          .single();

        if (v) {
          const vehicle = v as unknown as Vehicle;
          setSelectedVehicle(vehicle);
          setForm((prev) => ({
            ...prev,
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
      const { data, error } = await supabase
        .from("certificates")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          vehicle_id: form.vehicle_id || null,
          service_type: form.service_type || null,
          // content / vehicle_maker / vehicle_model / plate_display 列は存在しない。
          // 施工内容は content_free_text、車両は発行時スナップショットの vehicle_info_json。
          // public_id は DB 側の generate_public_id() が採番する
          content_free_text:
            [form.content_summary.trim(), form.notes.trim()].filter(Boolean).join("\n\n") || null,
          status: "draft",
          // customer_name は NOT NULL。顧客未選択でも空文字で通す（あとから編集できる）
          customer_name: selectedVehicle?.customers?.name ?? "",
          vehicle_info_json: {
            maker: form.vehicle_maker.trim(),
            model: form.vehicle_model.trim(),
            plate: form.vehicle_plate.trim(),
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
      router.replace(`/certificates/${data.id}`);
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    // Allow either vehicle_id (master) or manual maker/model entry
    if (!form.vehicle_id && !form.vehicle_maker.trim() && !form.vehicle_model.trim()) {
      e.vehicle = "車両を選択するか、メーカー・車種を入力してください";
    }
    if (!form.service_type) e.service_type = "サービス種別を選択してください";
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
