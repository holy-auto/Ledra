import { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl, Image } from "react-native";
import {
  Text,
  Card,
  Button,
  Chip,
  TextInput,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface WorkOrder {
  id: string;
  status: string;
  sub_status: string | null;
  progress_note: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  customer: {
    name: string;
    phone: string | null;
  } | null;
  vehicle: {
    plate_number: string;
    make: string | null;
    model: string | null;
  } | null;
  reservation_items: {
    id: string;
    quantity: number;
    menu_item: { name: string } | null;
  }[];
}

interface WorkPhoto {
  id: string;
  image_url: string;
  caption: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  arrived: "来店済み",
  in_progress: "作業中",
  completed: "完了",
};

export default function WorkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [subStatus, setSubStatus] = useState("");
  const [progressNote, setProgressNote] = useState("");
  const [snackbar, setSnackbar] = useState("");

  const { data: work, isLoading } = useQuery<WorkOrder>({
    queryKey: ["work-order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id, status, sub_status, progress_note, scheduled_date, scheduled_time,
          customer:customers(name, phone),
          vehicle:vehicles(plate_number, make, model),
          reservation_items(
            id, quantity,
            menu_item:menu_items(name)
          )
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      const wo = data as unknown as WorkOrder;
      setSubStatus(wo.sub_status ?? "");
      setProgressNote(wo.progress_note ?? "");
      return wo;
    },
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery<WorkPhoto[]>({
    queryKey: ["work-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificate_images")
        .select("id, image_url, caption")
        .eq("reservation_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkPhoto[];
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("reservations")
        .update({
          sub_status: subStatus || null,
          progress_note: progressNote || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-order", id] });
      setSnackbar("更新しました");
    },
    onError: () => setSnackbar("更新に失敗しました"),
  });

  async function onRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["work-order", id] });
    await queryClient.invalidateQueries({ queryKey: ["work-photos", id] });
    setRefreshing(false);
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!work) {
    return (
      <View style={styles.center}>
        <Text>作業が見つかりません</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "作業詳細" }} />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Overview */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={styles.heading}>
                  {work.vehicle?.plate_number ?? "車両不明"}
                </Text>
                <Text variant="bodyMedium" style={styles.subText}>
                  {work.customer?.name ?? "顧客不明"} /{" "}
                  {work.scheduled_date}
                </Text>
              </View>
              <Chip
                style={{ backgroundColor: "#8b5cf620" }}
                textStyle={{ color: "#8b5cf6", fontWeight: "600" }}
              >
                {STATUS_LABELS[work.status] ?? work.status}
              </Chip>
            </View>

            <Text
              variant="bodySmall"
              style={[styles.subText, { marginTop: 8 }]}
            >
              {work.reservation_items
                .map((ri) => ri.menu_item?.name ?? "不明")
                .join(", ")}
            </Text>
          </Card.Content>
        </Card>

        {/* Photos Gallery */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.headerRow}>
              <Text variant="titleMedium" style={styles.heading}>
                写真
              </Text>
              <Button
                mode="contained-tonal"
                icon="camera"
                compact
                onPress={() => router.push(`/work/${id}/photos`)}
              >
                写真撮影
              </Button>
            </View>
            {photos.length > 0 ? (
              <View style={styles.photoGrid}>
                {photos.slice(0, 6).map((photo) => (
                  <Image
                    key={photo.id}
                    source={{ uri: photo.image_url }}
                    style={styles.photoThumb}
                  />
                ))}
              </View>
            ) : (
              <Text variant="bodyMedium" style={styles.subText}>
                まだ写真がありません
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Sub-status & Progress Note */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              作業メモ
            </Text>
            <TextInput
              mode="outlined"
              label="サブステータス"
              value={subStatus}
              onChangeText={setSubStatus}
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="進捗メモ"
              value={progressNote}
              onChangeText={setProgressNote}
              multiline
              numberOfLines={3}
              style={styles.input}
            />
            <Button
              mode="contained"
              icon="content-save"
              onPress={() => updateMutation.mutate()}
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
              style={styles.saveButton}
              buttonColor="#1a1a2e"
            >
              保存
            </Button>
          </Card.Content>
        </Card>

        {/* Progress Publish */}
        <View style={styles.actions}>
          <Button
            mode="contained-tonal"
            icon="bullhorn"
            onPress={() => router.push(`/work/${id}/progress`)}
            style={styles.actionButton}
          >
            進捗を更新
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: "#ffffff",
  },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  subText: { color: "#71717a" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  photoThumb: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: "#e4e4e7",
  },
  input: {
    marginBottom: 12,
    backgroundColor: "#ffffff",
  },
  saveButton: {
    borderRadius: 8,
  },
  actions: { padding: 16, gap: 12 },
  actionButton: { borderRadius: 8 },
});
