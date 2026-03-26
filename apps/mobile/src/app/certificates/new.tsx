import { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, Button, HelperText, Menu, List } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface Vehicle {
  id: string;
  plate_display: string | null;
  maker: string | null;
  model: string | null;
  customer_name: string | null;
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
        .select("id, plate_display, maker, model, customer_name")
        .eq("tenant_id", user!.tenantId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Vehicle[];
    },
    enabled: !!user?.tenantId,
  });

  // If reservationId provided, load reservation to pre-fill vehicle
  useEffect(() => {
    if (!reservationId || !user?.tenantId) return;

    async function loadReservation() {
      const { data } = await supabase
        .from("reservations")
        .select("vehicle_id")
        .eq("id", reservationId)
        .eq("tenant_id", user!.tenantId)
        .single();

      if (data?.vehicle_id) {
        setForm((prev) => ({ ...prev, vehicle_id: data.vehicle_id }));

        const { data: v } = await supabase
          .from("vehicles")
          .select("id, plate_display, maker, model, customer_name")
          .eq("id", data.vehicle_id)
          .single();

        if (v) setSelectedVehicle(v as Vehicle);
      }
    }

    loadReservation();
  }, [reservationId, user?.tenantId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          vehicle_id: form.vehicle_id || null,
          service_type: form.service_type || null,
          content: {
            summary: form.content_summary.trim(),
            notes: form.notes.trim(),
          },
          status: "draft",
          customer_name: selectedVehicle?.customer_name ?? null,
          vehicle_maker: selectedVehicle?.maker ?? null,
          vehicle_model: selectedVehicle?.model ?? null,
          plate_display: selectedVehicle?.plate_display ?? null,
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
    if (!form.vehicle_id) e.vehicle_id = "車両を選択してください";
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
    setForm((prev) => ({ ...prev, vehicle_id: v.id }));
    setVehicleMenuVisible(false);
    if (errors.vehicle_id) setErrors((prev) => ({ ...prev, vehicle_id: "" }));
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
        {/* Vehicle Picker */}
        <Menu
          visible={vehicleMenuVisible}
          onDismiss={() => setVehicleMenuVisible(false)}
          anchor={
            <TextInput
              label="車両 *"
              value={
                selectedVehicle
                  ? `${selectedVehicle.maker ?? ""} ${selectedVehicle.model ?? ""} (${selectedVehicle.plate_display ?? ""})`
                  : ""
              }
              mode="outlined"
              editable={false}
              onPressIn={() => setVehicleMenuVisible(true)}
              right={<TextInput.Icon icon="chevron-down" />}
              error={!!errors.vehicle_id}
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
        {errors.vehicle_id && (
          <HelperText type="error">{errors.vehicle_id}</HelperText>
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

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          buttonColor="#1a1a2e"
          style={styles.button}
        >
          下書き保存
        </Button>

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
  container: { flex: 1, backgroundColor: "#fafafa" },
  form: { padding: 16 },
  input: { marginBottom: 8, backgroundColor: "#ffffff" },
  menu: { maxHeight: 300 },
  button: { marginTop: 16 },
  errorText: { marginTop: 8 },
});
