import { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, Button, HelperText } from "react-native-paper";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

export default function VehicleNewScreen() {
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    maker: "",
    model: "",
    year: "",
    plate_display: "",
    customer_name: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          maker: form.maker.trim() || null,
          model: form.model.trim() || null,
          year: form.year.trim() ? parseInt(form.year.trim(), 10) : null,
          plate_display: form.plate_display.trim() || null,
          customer_name: form.customer_name.trim() || null,
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

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.form}>
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
          label="オーナー名"
          value={form.customer_name}
          onChangeText={(v) => update("customer_name", v)}
          mode="outlined"
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
          登録する
        </Button>

        {mutation.isError && (
          <HelperText type="error" style={styles.errorText}>
            登録に失敗しました: {mutation.error.message}
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
  button: { marginTop: 16 },
  errorText: { marginTop: 8 },
});
