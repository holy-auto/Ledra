import { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import {
  Text,
  Card,
  Button,
  Chip,
  Divider,
  ActivityIndicator,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface Reservation {
  id: string;
  status: string;
  payment_status: string;
  scheduled_date: string;
  scheduled_time: string | null;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    plate_number: string;
    make: string | null;
    model: string | null;
    color: string | null;
  } | null;
  reservation_items: {
    id: string;
    quantity: number;
    unit_price: number;
    menu_item: {
      name: string;
    } | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: "確認済み",
  arrived: "来店済み",
  in_progress: "作業中",
  completed: "完了",
  cancelled: "キャンセル",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#3b82f6",
  arrived: "#f59e0b",
  in_progress: "#8b5cf6",
  completed: "#10b981",
  cancelled: "#ef4444",
};

export default function ReservationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: reservation, isLoading } = useQuery<Reservation>({
    queryKey: ["reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id, status, payment_status, scheduled_date, scheduled_time, notes,
          customer:customers(id, name, phone, email),
          vehicle:vehicles(id, plate_number, make, model, color),
          reservation_items(
            id, quantity, unit_price,
            menu_item:menu_items(name)
          )
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as Reservation;
    },
    enabled: !!id,
  });

  const checkinMutation = useMutation({
    mutationFn: () =>
      mobileApi(`/reservations/${id}/checkin`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservation", id] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () =>
      mobileApi(`/reservations/${id}/start`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservation", id] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: () =>
      mobileApi(`/reservations/${id}/complete`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservation", id] });
    },
  });

  async function onRefresh() {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["reservation", id] });
    setRefreshing(false);
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!reservation) {
    return (
      <View style={styles.center}>
        <Text>予約が見つかりません</Text>
      </View>
    );
  }

  const total = reservation.reservation_items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  return (
    <>
      <Stack.Screen options={{ title: "予約詳細" }} />
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Status */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <View style={styles.statusRow}>
              <Text variant="titleMedium" style={styles.heading}>
                ステータス
              </Text>
              <Chip
                style={{
                  backgroundColor:
                    (STATUS_COLORS[reservation.status] ?? "#71717a") + "20",
                }}
                textStyle={{
                  color: STATUS_COLORS[reservation.status] ?? "#71717a",
                  fontWeight: "600",
                }}
              >
                {STATUS_LABELS[reservation.status] ?? reservation.status}
              </Chip>
            </View>
            <Text variant="bodyMedium" style={styles.dateText}>
              {reservation.scheduled_date}
              {reservation.scheduled_time
                ? ` ${reservation.scheduled_time}`
                : ""}
            </Text>
          </Card.Content>
        </Card>

        {/* Customer */}
        {reservation.customer && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                顧客情報
              </Text>
              <Text variant="bodyLarge" style={styles.name}>
                {reservation.customer.name}
              </Text>
              {reservation.customer.phone && (
                <Text variant="bodyMedium" style={styles.subText}>
                  TEL: {reservation.customer.phone}
                </Text>
              )}
              {reservation.customer.email && (
                <Text variant="bodyMedium" style={styles.subText}>
                  {reservation.customer.email}
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Vehicle */}
        {reservation.vehicle && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                車両情報
              </Text>
              <Text variant="bodyLarge" style={styles.name}>
                {reservation.vehicle.plate_number}
              </Text>
              <Text variant="bodyMedium" style={styles.subText}>
                {[
                  reservation.vehicle.make,
                  reservation.vehicle.model,
                  reservation.vehicle.color,
                ]
                  .filter(Boolean)
                  .join(" / ")}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Menu Items */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              メニュー
            </Text>
            {reservation.reservation_items.map((item) => (
              <View key={item.id} style={styles.menuRow}>
                <Text variant="bodyMedium" style={{ flex: 1 }}>
                  {item.menu_item?.name ?? "不明"}
                </Text>
                <Text variant="bodyMedium" style={styles.subText}>
                  x{item.quantity}
                </Text>
                <Text variant="bodyMedium" style={styles.price}>
                  {"\u00a5"}
                  {(item.quantity * item.unit_price).toLocaleString()}
                </Text>
              </View>
            ))}
            <Divider style={{ marginVertical: 8 }} />
            <View style={styles.menuRow}>
              <Text variant="titleSmall" style={{ flex: 1, fontWeight: "700" }}>
                合計
              </Text>
              <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                {"\u00a5"}
                {total.toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Notes */}
        {reservation.notes && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                備考
              </Text>
              <Text variant="bodyMedium">{reservation.notes}</Text>
            </Card.Content>
          </Card>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {reservation.status === "confirmed" && (
            <Button
              mode="contained"
              icon="account-check"
              onPress={() => checkinMutation.mutate()}
              loading={checkinMutation.isPending}
              disabled={checkinMutation.isPending}
              style={styles.actionButton}
              buttonColor="#3b82f6"
            >
              チェックイン
            </Button>
          )}
          {reservation.status === "arrived" && (
            <Button
              mode="contained"
              icon="play"
              onPress={() => startMutation.mutate()}
              loading={startMutation.isPending}
              disabled={startMutation.isPending}
              style={styles.actionButton}
              buttonColor="#8b5cf6"
            >
              作業開始
            </Button>
          )}
          {reservation.status === "in_progress" && (
            <Button
              mode="contained"
              icon="check"
              onPress={() => completeMutation.mutate()}
              loading={completeMutation.isPending}
              disabled={completeMutation.isPending}
              style={styles.actionButton}
              buttonColor="#10b981"
            >
              作業完了
            </Button>
          )}
          {reservation.status === "completed" &&
            reservation.payment_status === "unpaid" && (
              <Button
                mode="contained"
                icon="cash-register"
                onPress={() => router.push(`/pos/checkout/${id}`)}
                style={styles.actionButton}
                buttonColor="#f59e0b"
              >
                会計へ
              </Button>
            )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: { color: "#71717a", marginTop: 4 },
  name: { fontWeight: "600", color: "#1a1a2e" },
  subText: { color: "#71717a", marginTop: 2 },
  price: { fontWeight: "600", color: "#1a1a2e", marginLeft: 12 },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actions: { padding: 16, gap: 12 },
  actionButton: { borderRadius: 8 },
});
