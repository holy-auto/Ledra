import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Card,
  Button,
  Divider,
  ActivityIndicator,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";

interface Payment {
  id: string;
  amount: number;
  payment_method: string;
  paid_at: string;
  received_amount: number | null;
  change_amount: number | null;
  reservation: {
    id: string;
    customer: { name: string; phone: string | null } | null;
    vehicle: { plate_number: string; make: string | null; model: string | null } | null;
    reservation_items: {
      id: string;
      quantity: number;
      unit_price: number;
      menu_item: { name: string } | null;
    }[];
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  card: "カード",
  qr: "QR決済",
  bank_transfer: "振込",
};

export default function PosReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();

  const { data: payment, isLoading } = useQuery<Payment>({
    queryKey: ["payment-receipt", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          id, amount, payment_method, paid_at, received_amount, change_amount,
          reservation:reservations(
            id,
            customer:customers(name, phone),
            vehicle:vehicles(plate_number, make, model),
            reservation_items(
              id, quantity, unit_price,
              menu_item:menu_items(name)
            )
          )
        `
        )
        .eq("reservation_id", id)
        .order("paid_at", { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as Payment;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!payment) {
    return (
      <View style={styles.center}>
        <Text>レシートが見つかりません</Text>
      </View>
    );
  }

  const paidDate = new Date(payment.paid_at);

  return (
    <>
      <Stack.Screen options={{ title: "レシート" }} />
      <ScrollView style={styles.container}>
        {/* Header */}
        <Card style={styles.card} mode="outlined">
          <Card.Content style={styles.receiptHeader}>
            <Text variant="headlineSmall" style={styles.checkmark}>
              {"\u2713"}
            </Text>
            <Text variant="titleLarge" style={styles.paidText}>
              お支払い完了
            </Text>
            <Text variant="headlineMedium" style={styles.amount}>
              {"\u00a5"}
              {payment.amount.toLocaleString()}
            </Text>
            <Text variant="bodyMedium" style={styles.subText}>
              {METHOD_LABELS[payment.payment_method] ?? payment.payment_method}
            </Text>
            <Text variant="bodySmall" style={styles.subText}>
              {paidDate.toLocaleDateString("ja-JP")}{" "}
              {paidDate.toLocaleTimeString("ja-JP", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </Card.Content>
        </Card>

        {/* Customer & Vehicle */}
        {payment.reservation && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                顧客 / 車両
              </Text>
              <Text variant="bodyLarge" style={{ fontWeight: "600" }}>
                {payment.reservation.customer?.name ?? "不明"}
              </Text>
              {payment.reservation.customer?.phone && (
                <Text variant="bodySmall" style={styles.subText}>
                  {payment.reservation.customer.phone}
                </Text>
              )}
              <Text variant="bodyMedium" style={{ marginTop: 4 }}>
                {payment.reservation.vehicle?.plate_number ?? ""}{" "}
                {[
                  payment.reservation.vehicle?.make,
                  payment.reservation.vehicle?.model,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </Text>
            </Card.Content>
          </Card>
        )}

        {/* Line Items */}
        {payment.reservation && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                明細
              </Text>
              {payment.reservation.reservation_items.map((item) => (
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
              <Divider style={{ marginVertical: 8 }} />
              <View style={styles.lineItem}>
                <Text
                  variant="titleSmall"
                  style={{ flex: 1, fontWeight: "700" }}
                >
                  合計
                </Text>
                <Text variant="titleSmall" style={{ fontWeight: "700" }}>
                  {"\u00a5"}
                  {payment.amount.toLocaleString()}
                </Text>
              </View>
              {payment.payment_method === "cash" && (
                <>
                  <View style={styles.lineItem}>
                    <Text variant="bodyMedium" style={{ flex: 1 }}>
                      お預かり
                    </Text>
                    <Text variant="bodyMedium">
                      {"\u00a5"}
                      {(payment.received_amount ?? 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.lineItem}>
                    <Text variant="bodyMedium" style={{ flex: 1 }}>
                      おつり
                    </Text>
                    <Text variant="bodyMedium">
                      {"\u00a5"}
                      {(payment.change_amount ?? 0).toLocaleString()}
                    </Text>
                  </View>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            mode="contained"
            icon="certificate"
            onPress={() =>
              router.push(`/certificates/new?reservationId=${id}`)
            }
            style={styles.actionButton}
            buttonColor="#1a1a2e"
          >
            証明書を作成
          </Button>
          <Button
            mode="outlined"
            icon="home"
            onPress={() => router.replace("/(tabs)")}
            style={styles.actionButton}
          >
            ホームに戻る
          </Button>
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
  receiptHeader: {
    alignItems: "center",
    paddingVertical: 24,
  },
  checkmark: {
    fontSize: 48,
    color: "#10b981",
  },
  paidText: {
    fontWeight: "700",
    color: "#1a1a2e",
    marginTop: 8,
  },
  amount: {
    fontWeight: "700",
    color: "#1a1a2e",
    marginTop: 4,
  },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  subText: { color: "#71717a", marginTop: 2 },
  price: { fontWeight: "600", color: "#1a1a2e", marginLeft: 12 },
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  actions: { padding: 16, gap: 12 },
  actionButton: { borderRadius: 8 },
});
