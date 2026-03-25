import { useState, useEffect, useRef } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Button,
  Divider,
  SegmentedButtons,
  TextInput,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface ReservationCheckout {
  id: string;
  status: string;
  payment_status: string;
  customer: { name: string } | null;
  vehicle: { plate_number: string } | null;
  reservation_items: {
    id: string;
    quantity: number;
    unit_price: number;
    menu_item: { name: string } | null;
  }[];
}

type PaymentMethod = "cash" | "card" | "qr" | "bank_transfer";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "qr", label: "QR" },
  { value: "bank_transfer", label: "振込" },
];

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function PosCheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const idempotencyKey = useRef(generateUUID()).current;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [snackbar, setSnackbar] = useState("");

  const { data: reservation, isLoading } = useQuery<ReservationCheckout>({
    queryKey: ["checkout-reservation", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(
          `
          id, status, payment_status,
          customer:customers(name),
          vehicle:vehicles(plate_number),
          reservation_items(
            id, quantity, unit_price,
            menu_item:menu_items(name)
          )
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as ReservationCheckout;
    },
    enabled: !!id,
  });

  const total = (reservation?.reservation_items ?? []).reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0
  );

  const received = parseInt(receivedAmount, 10) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - total) : 0;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("pos_checkout", {
        p_reservation_id: id,
        p_tenant_id: user!.tenantId,
        p_store_id: selectedStore!.id,
        p_payment_method: paymentMethod,
        p_amount: total,
        p_received_amount: paymentMethod === "cash" ? received : total,
        p_change_amount: change,
        p_cashier_id: user!.id,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      router.replace(`/pos/receipt/${id}`);
    },
    onError: (err) => {
      setSnackbar(
        err instanceof Error ? err.message : "決済に失敗しました"
      );
    },
  });

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

  return (
    <>
      <Stack.Screen options={{ title: "会計" }} />
      <ScrollView style={styles.container}>
        {/* Customer & Vehicle */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              {reservation.customer?.name ?? "顧客不明"}
            </Text>
            <Text variant="bodyMedium" style={styles.subText}>
              {reservation.vehicle?.plate_number ?? ""}
            </Text>
          </Card.Content>
        </Card>

        {/* Line Items */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              明細
            </Text>
            {reservation.reservation_items.map((item) => (
              <View key={item.id} style={styles.lineItem}>
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
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.lineItem}>
              <Text variant="titleMedium" style={{ flex: 1, fontWeight: "700" }}>
                合計
              </Text>
              <Text
                variant="headlineSmall"
                style={{ fontWeight: "700", color: "#1a1a2e" }}
              >
                {"\u00a5"}
                {total.toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* Payment Method */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              支払方法
            </Text>
            <SegmentedButtons
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              buttons={PAYMENT_METHODS}
              style={{ marginBottom: 12 }}
            />

            {paymentMethod === "cash" && (
              <>
                <TextInput
                  mode="outlined"
                  label="お預かり金額"
                  value={receivedAmount}
                  onChangeText={setReceivedAmount}
                  keyboardType="numeric"
                  style={{ backgroundColor: "#ffffff", marginBottom: 8 }}
                  right={<TextInput.Affix text="円" />}
                />
                <View style={styles.changeRow}>
                  <Text variant="bodyMedium">おつり:</Text>
                  <Text
                    variant="titleMedium"
                    style={{
                      fontWeight: "700",
                      color: change >= 0 ? "#10b981" : "#ef4444",
                    }}
                  >
                    {"\u00a5"}
                    {change.toLocaleString()}
                  </Text>
                </View>
              </>
            )}
          </Card.Content>
        </Card>

        {/* Submit */}
        <View style={styles.submitArea}>
          <Button
            mode="contained"
            icon="credit-card-check"
            onPress={() => checkoutMutation.mutate()}
            loading={checkoutMutation.isPending}
            disabled={
              checkoutMutation.isPending ||
              (paymentMethod === "cash" && received < total)
            }
            style={styles.submitButton}
            buttonColor="#1a1a2e"
            contentStyle={{ paddingVertical: 8 }}
          >
            決済確定
          </Button>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
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
  price: { fontWeight: "600", color: "#1a1a2e", marginLeft: 12 },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  submitArea: { padding: 16 },
  submitButton: { borderRadius: 8 },
});
