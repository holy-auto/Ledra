import { useState } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Button,
  RadioButton,
  TextInput,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

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
        reservation_id: id,
        event_type: "progress_update",
        title: selectedLabel,
        description: note || null,
        is_public: true,
        created_by: user!.id,
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
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              ステータスを選択
            </Text>
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
                />
              ))}
            </RadioButton.Group>
          </Card.Content>
        </Card>

        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              メモ（任意）
            </Text>
            <TextInput
              mode="outlined"
              multiline
              numberOfLines={3}
              value={note}
              onChangeText={setNote}
              placeholder="お客様への補足メッセージ..."
              style={{ backgroundColor: "#ffffff" }}
            />
          </Card.Content>
        </Card>

        <View style={styles.submitArea}>
          <Text variant="bodySmall" style={styles.notice}>
            この内容はお客様に公開されます
          </Text>
          <Button
            mode="contained"
            icon="send"
            onPress={() => publishMutation.mutate()}
            loading={publishMutation.isPending}
            disabled={publishMutation.isPending}
            style={styles.submitButton}
            buttonColor="#1a1a2e"
          >
            進捗を公開
          </Button>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#ffffff",
  },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  radioItem: {
    paddingVertical: 4,
  },
  radioLabel: {
    fontSize: 15,
  },
  submitArea: {
    padding: 16,
    gap: 12,
  },
  notice: {
    color: "#71717a",
    textAlign: "center",
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 4,
  },
});
