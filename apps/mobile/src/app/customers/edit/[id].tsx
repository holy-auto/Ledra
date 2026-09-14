import { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { TextInput, HelperText, ActivityIndicator } from "react-native-paper";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { LedraButton } from "@/components/ui";
import { colors, spacing } from "@/constants/tokens";

export default function CustomerEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
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
      return data;
    },
    enabled: !!id && !!user?.tenantId,
  });

  useEffect(() => {
    if (customer) {
      setForm({
        name: customer.name ?? "",
        name_kana: customer.name_kana ?? "",
        email: customer.email ?? "",
        phone: customer.phone ?? "",
        postal_code: customer.postal_code ?? "",
        address: customer.address ?? "",
        note: customer.note ?? "",
      });
    }
  }, [customer]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .update({
          name: form.name.trim(),
          name_kana: form.name_kana.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          postal_code: form.postal_code.trim() || null,
          address: form.address.trim() || null,
          note: form.note.trim() || null,
        })
        .eq("id", id)
        .eq("tenant_id", user!.tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      router.back();
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

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
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

        <LedraButton
          onPress={handleSubmit}
          loading={mutation.isPending}
          disabled={mutation.isPending}
          style={styles.button}
        >
          保存する
        </LedraButton>

        {mutation.isError && (
          <HelperText type="error" style={styles.errorText}>
            更新に失敗しました: {mutation.error.message}
          </HelperText>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  form: { padding: spacing.lg },
  input: { marginBottom: spacing.sm, backgroundColor: colors.surface },
  button: { marginTop: spacing.lg },
  errorText: { marginTop: spacing.sm },
});
