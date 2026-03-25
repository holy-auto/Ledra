import { useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, Button, HelperText } from "react-native-paper";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";

export default function CustomerNewScreen() {
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: "",
    name_kana: "",
    email: "",
    phone: "",
    postal_code: "",
    address: "",
    note: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: user!.tenantId,
          store_id: selectedStore!.id,
          name: form.name.trim(),
          name_kana: form.name_kana.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          postal_code: form.postal_code.trim() || null,
          address: form.address.trim() || null,
          note: form.note.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      router.replace(`/customers/${data.id}`);
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "名前は必須です";
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
          label="名前 *"
          value={form.name}
          onChangeText={(v) => update("name", v)}
          mode="outlined"
          error={!!errors.name}
          style={styles.input}
        />
        {errors.name && <HelperText type="error">{errors.name}</HelperText>}

        <TextInput
          label="フリガナ"
          value={form.name_kana}
          onChangeText={(v) => update("name_kana", v)}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="メールアドレス"
          value={form.email}
          onChangeText={(v) => update("email", v)}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          label="電話番号"
          value={form.phone}
          onChangeText={(v) => update("phone", v)}
          mode="outlined"
          keyboardType="phone-pad"
          style={styles.input}
        />

        <TextInput
          label="郵便番号"
          value={form.postal_code}
          onChangeText={(v) => update("postal_code", v)}
          mode="outlined"
          keyboardType="number-pad"
          style={styles.input}
        />

        <TextInput
          label="住所"
          value={form.address}
          onChangeText={(v) => update("address", v)}
          mode="outlined"
          style={styles.input}
        />

        <TextInput
          label="メモ"
          value={form.note}
          onChangeText={(v) => update("note", v)}
          mode="outlined"
          multiline
          numberOfLines={3}
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
