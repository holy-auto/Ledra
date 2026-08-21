import { useState } from "react";
import { View, StyleSheet, ScrollView, RefreshControl } from "react-native";
import {
  Text,
  ActivityIndicator,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { LedraButton, StatusBadge } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface Reservation {
  id: string;
  status: string;
  payment_status: string;
  scheduled_date: string;
  start_time: string | null;
  notes: string | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  vehicle: {
    id: string;
    plate_display: string;
    maker: string | null;
    model: string | null;
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

const STATUS_SEVERITY: Record<string, "info" | "warning" | "info" | "success" | "danger"> = {
  confirmed: "info",
  arrived: "warning",
  in_progress: "info",
  completed: "success",
  cancelled: "danger",
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
          id, status, payment_status, scheduled_date, start_time, notes,
          customer:customers(id, name, phone, email),
          vehicle:vehicles(id, plate_display, maker, model),
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
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <Text style={styles.heading}>
              ステータス
            </Text>
            <StatusBadge
              label={STATUS_LABELS[reservation.status] ?? reservation.status}
              severity={STATUS_SEVERITY[reservation.status] ?? "neutral"}
            />
          </View>
          <Text style={styles.dateText}>
            {reservation.scheduled_date}
            {reservation.start_time
              ? ` ${reservation.start_time}`
              : ""}
          </Text>
        </View>

        {/* Customer */}
        {reservation.customer && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              顧客情報
            </Text>
            <Text style={styles.name}>
              {reservation.customer.name}
            </Text>
            {reservation.customer.phone && (
              <Text style={styles.subText}>
                TEL: {reservation.customer.phone}
              </Text>
            )}
            {reservation.customer.email && (
              <Text style={styles.subText}>
                {reservation.customer.email}
              </Text>
            )}
          </View>
        )}

        {/* Vehicle */}
        {reservation.vehicle && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              車両情報
            </Text>
            <Text style={styles.name}>
              {reservation.vehicle.plate_display}
            </Text>
            <Text style={styles.subText}>
              {[
                reservation.vehicle.maker,
                reservation.vehicle.model,
              ]
                .filter(Boolean)
                .join(" / ")}
            </Text>
          </View>
        )}

        {/* Menu Items */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            メニュー
          </Text>
          {reservation.reservation_items.map((item) => (
            <View key={item.id} style={styles.menuRow}>
              <Text style={[styles.bodyText, { flex: 1 }]}>
                {item.menu_item?.name ?? "不明"}
              </Text>
              <Text style={styles.subText}>
                x{item.quantity}
              </Text>
              <Text style={styles.price}>
                {"¥"}
                {(item.quantity * item.unit_price).toLocaleString()}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.menuRow}>
            <Text style={[styles.totalLabel, { flex: 1 }]}>
              合計
            </Text>
            <Text style={styles.totalLabel}>
              {"¥"}
              {total.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {reservation.notes && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              備考
            </Text>
            <Text style={styles.bodyText}>{reservation.notes}</Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actions}>
          {reservation.status === "confirmed" && (
            <LedraButton
              icon="account-check"
              onPress={() => checkinMutation.mutate()}
              loading={checkinMutation.isPending}
              disabled={checkinMutation.isPending}
            >
              チェックイン
            </LedraButton>
          )}
          {reservation.status === "arrived" && (
            <LedraButton
              icon="play"
              onPress={() => startMutation.mutate()}
              loading={startMutation.isPending}
              disabled={startMutation.isPending}
              style={{ backgroundColor: colors.info }}
            >
              作業開始
            </LedraButton>
          )}
          {reservation.status === "in_progress" && (
            <LedraButton
              icon="check"
              onPress={() => completeMutation.mutate()}
              loading={completeMutation.isPending}
              disabled={completeMutation.isPending}
              style={{ backgroundColor: colors.success }}
            >
              作業完了
            </LedraButton>
          )}
          {reservation.status === "completed" &&
            reservation.payment_status === "unpaid" && (
              <LedraButton
                icon="cash-register"
                onPress={() => router.push(`/pos/checkout/${id}`)}
                style={{ backgroundColor: colors.warning }}
              >
                会計へ
              </LedraButton>
            )}
        </View>

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  name: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  price: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginLeft: spacing.md,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    ...typography.titleSmall,
    color: colors.textPrimary,
  },
  actions: { padding: spacing.lg, gap: spacing.md },
});
