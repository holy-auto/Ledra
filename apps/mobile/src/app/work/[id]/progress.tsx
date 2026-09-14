import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  RadioButton,
  TextInput,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

const PROGRESS_LABELS = [
  "受付完了",
  "作業を開始しました",
  "まもなく完了です",
  "作業が完了しました",
  "お引き渡し準備中です",
];

export default function WorkProgressScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const [selectedLabel, setSelectedLabel] = useState(PROGRESS_LABELS[0]);
  const [note, setNote] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // Get vehicle_id from reservation
  const { data: reservation } = useQuery({
    queryKey: ["work-reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select("vehicle_id, customer_id")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!reservation?.vehicle_id) {
        throw new Error("車両情報が見つかりません");
      }

      const { error } = await supabase.from("vehicle_histories").insert({
        tenant_id: user!.tenantId,
        vehicle_id: reservation.vehicle_id,
        type: "progress_update",
        title: selectedLabel,
        description: note || null,
        performed_at: new Date().toISOString(),
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setSnackbar("進捗を公開しました");
      setTimeout(() => router.back(), 1200);
    },
    onError: (err) => {
      setSnackbar(
        err instanceof Error ? err.message : "公開に失敗しました"
      );
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: "進捗公開" }} />
      <ScrollView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.heading}>ステータスを選択</Text>
          <RadioButton.Group
            onValueChange={setSelectedLabel}
            value={selectedLabel}
          >
            {PROGRESS_LABELS.map((label) => (
              <RadioButton.Item
                key={label}
                label={label}
                value={label}
                labelStyle={styles.radioLabel}
                style={styles.radioItem}
                color={colors.primary}
                uncheckedColor={colors.textTertiary}
              />
            ))}
          </RadioButton.Group>
        </View>

        <View style={styles.card}>
          <Text style={styles.heading}>メモ（任意）</Text>
          <TextInput
            mode="outlined"
            multiline
            numberOfLines={3}
            value={note}
            onChangeText={setNote}
            placeholder="お客様への補足メッセージ..."
            style={{ backgroundColor: colors.surface }}
          />
        </View>

        <View style={styles.submitArea}>
          <Text style={styles.notice}>
            この内容はお客様に公開されます
          </Text>
          <LedraButton
            icon="send"
            onPress={() => publishMutation.mutate()}
            loading={publishMutation.isPending}
            disabled={publishMutation.isPending}
          >
            進捗を公開
          </LedraButton>
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
        style={{ backgroundColor: colors.textPrimary }}
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
  radioItem: {
    paddingVertical: spacing.xs,
  },
  radioLabel: {
    ...typography.body,
    color: colors.textPrimary,
  },
  submitArea: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  notice: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
