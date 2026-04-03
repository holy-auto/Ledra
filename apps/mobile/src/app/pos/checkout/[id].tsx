import { useState, useRef, useEffect } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
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
import { useTerminal } from "@/hooks/useTerminal";

// ─────────────────────────────────────────────────────────────
// 端末種別の判定
//   iPhone  → Tap to Pay
//   iPad    → 確認・管理専用（カード決済なし）
//   Android → Stripe Checkout QR
// ─────────────────────────────────────────────────────────────
function useDeviceType() {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") {
      // expo-device がない場合はウィンドウ幅で判定
      const { width, height } =
        require("react-native").Dimensions.get("window");
      setIsTablet(Math.min(width, height) >= 768);
    }
  }, []);

  const os = Platform.OS; // "ios" | "android" | "web"
  const isIPhone = os === "ios" && !isTablet;
  const isIPad = os === "ios" && isTablet;
  const isAndroid = os === "android";

  return { isIPhone, isIPad, isAndroid, isTablet };
}

// ─────────────────────────────────────────────────────────────

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

// iPad では「カード」選択肢を除外
type PaymentMethod = "cash" | "card" | "qr" | "bank_transfer";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─────────────────────────────────────────────────────────────
// QR決済ポーリング（Android）
// Stripe Checkout Session が paid になるまで監視
// ─────────────────────────────────────────────────────────────
function useQrPaymentPoller(
  sessionId: string | null,
  onPaid: () => void
) {
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      while (active) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const res = await mobileApi<{ status: string }>(
            `/pos/checkout/qr-status?session_id=${sessionId}`
          );
          if (res.status === "paid" && active) {
            active = false;
            onPaid();
          }
        } catch {
          // ポーリング失敗は無視して継続
        }
      }
    };
    poll();
    return () => { active = false; };
  }, [sessionId, onPaid]);
}

// ─────────────────────────────────────────────────────────────
export default function PosCheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const idempotencyKey = useRef(generateUUID()).current;
  const { isIPhone, isIPad, isAndroid } = useDeviceType();

  // 支払い方法の初期値：iPad はデフォルト現金
  const defaultMethod: PaymentMethod = "cash";
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(defaultMethod);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // QR決済用（Android）
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);

  // Stripe Terminal（iPhone専用）
  const {
    readerStatus,
    paymentStatus,
    connectTapToPay,
    initTerminal,
    processCardPayment,
    cancelPayment,
    resetPayment,
  } = useTerminal();

  // iPhone: マウント時にTerminal初期化（Tap to Pay）
  useEffect(() => {
    if (isIPhone) {
      initTerminal();
    }
  }, [isIPhone]);

  // QRポーリング
  useQrPaymentPoller(qrPolling ? qrSessionId : null, () => {
    setQrPolling(false);
    resetPayment();
    router.replace(`/pos/receipt/${id}`);
  });

  // ── 予約データ取得 ────────────────────────────────────────────
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

  // ── 決済ミューテーション ───────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // ────────────────────────────────────────────────────────
      // A. iPhone: Tap to Pay
      // ────────────────────────────────────────────────────────
      if (isIPhone && paymentMethod === "card") {
        // Tap to Pay 未接続なら接続
        if (readerStatus !== "connected") {
          const ok = await connectTapToPay();
          if (!ok) throw new Error("Tap to Pay の準備ができませんでした");
        }
        const result = await processCardPayment({
          amountJpy: total,
          description: `Ledra POS - ${reservation?.customer?.name ?? "会計"}`,
          reservationId: id,
          storeId: selectedStore!.id,
          tenantId: user!.tenantId,
        });
        if (!result.success) {
          if (result.cancelled) return;
          throw new Error(result.error ?? "カード決済失敗");
        }
        // Supabase に記録
        const { error } = await supabase.rpc("pos_checkout", {
          p_reservation_id: id,
          p_tenant_id: user!.tenantId,
          p_store_id: selectedStore!.id,
          p_payment_method: "card",
          p_amount: total,
          p_received_amount: total,
          p_change_amount: 0,
          p_cashier_id: user!.id,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
        return;
      }

      // ────────────────────────────────────────────────────────
      // B. iPad / Android: QRコード決済（Stripe Checkout）
      //    iPad は Tap to Pay 非対応のため QR で代替
      // ────────────────────────────────────────────────────────
      if ((isAndroid || isIPad) && paymentMethod === "card") {
        const res = await mobileApi<{ url: string; session_id: string }>(
          "/pos/checkout/qr-session",
          {
            method: "POST",
            body: {
              amount: total,
              reservation_id: id,
              tenant_id: user!.tenantId,
              store_id: selectedStore!.id,
            },
          }
        );
        setQrUrl(res.url);
        setQrSessionId(res.session_id);
        setQrPolling(true);
        return; // 以降はポーリングで処理
      }

      // ────────────────────────────────────────────────────────
      // C. 現金・QR(支払方法記録)・振込（全端末共通）
      // ────────────────────────────────────────────────────────
      const { error } = await supabase.rpc("pos_checkout", {
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
    },
    onSuccess: () => {
      if ((isAndroid || isIPad) && paymentMethod === "card") return; // QR はポーリング側で遷移
      resetPayment();
      router.replace(`/pos/receipt/${id}`);
    },
    onError: (err) => {
      setSnackbar(err instanceof Error ? err.message : "決済に失敗しました");
    },
  });

  // ── 支払い方法ボタン定義（端末別） ────────────────────────────
  const paymentButtons = (() => {
    if (isIPad) {
      // iPad: Tap to Pay 不可のため「QRコード決済」として card を提供
      return [
        { value: "cash", label: "現金" },
        { value: "card", label: "QR決済" },
        { value: "bank_transfer", label: "振込" },
      ];
    }
    if (isIPhone) {
      return [
        { value: "cash", label: "現金" },
        { value: "card", label: "Tap to Pay" },
        { value: "qr", label: "QR" },
        { value: "bank_transfer", label: "振込" },
      ];
    }
    // Android
    return [
      { value: "cash", label: "現金" },
      { value: "card", label: "QR決済" },
      { value: "bank_transfer", label: "振込" },
    ];
  })();

  // ── ローディング・エラー ───────────────────────────────────────
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

  // ── 決済ボタンの無効化条件 ─────────────────────────────────────
  const isProcessing =
    paymentStatus === "collecting" ||
    paymentStatus === "processing" ||
    paymentStatus === "capturing" ||
    paymentStatus === "creating";

  const isDisabled =
    checkoutMutation.isPending ||
    isProcessing ||
    qrPolling ||
    (paymentMethod === "cash" && received < total);

  // ── 決済ボタンラベル ──────────────────────────────────────────
  const submitLabel = (() => {
    if (qrPolling) return "お客様の決済完了を待っています...";
    if (isIPhone && paymentMethod === "card") {
      if (paymentStatus === "collecting") return "カードをかざしてください";
      if (isProcessing) return "処理中...";
      return "Tap to Pay で決済";
    }
    if ((isAndroid || isIPad) && paymentMethod === "card") return "QRコードを表示";
    return "決済確定";
  })();

  return (
    <>
      <Stack.Screen options={{ title: "会計" }} />
      <ScrollView style={[styles.container, isIPad && styles.containerTablet]}>

        {/* ── iPad モード バナー ────────────────────────────────── */}
        {isIPad && (
          <Card
            style={[styles.card, { backgroundColor: "#eff6ff" }]}
            mode="outlined"
          >
            <Card.Content
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Text style={{ fontSize: 20 }}>🖥️</Text>
              <View style={{ flex: 1 }}>
                <Text
                  variant="titleSmall"
                  style={{ fontWeight: "700", color: "#1d4ed8" }}
                >
                  iPad モード
                </Text>
                <Text variant="bodySmall" style={{ color: "#3b82f6" }}>
                  カード決済はQRコードでお客様スマホから受け付けます
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* ── 顧客・車両 ───────────────────────────────────────── */}
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

        {/* ── 明細 ─────────────────────────────────────────────── */}
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
                  {"¥"}
                  {(item.quantity * item.unit_price).toLocaleString()}
                </Text>
              </View>
            ))}
            <Divider style={{ marginVertical: 12 }} />
            <View style={styles.lineItem}>
              <Text
                variant="titleMedium"
                style={{ flex: 1, fontWeight: "700" }}
              >
                合計
              </Text>
              <Text
                variant="headlineSmall"
                style={{ fontWeight: "700", color: "#1a1a2e" }}
              >
                {"¥"}
                {total.toLocaleString()}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* ── iPhone: Tap to Pay ステータス ────────────────────── */}
        {isIPhone && paymentMethod === "card" && isProcessing && (
          <Card
            style={[styles.card, { backgroundColor: "#eff6ff" }]}
            mode="outlined"
          >
            <Card.Content
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              {paymentStatus === "collecting" ? (
                <>
                  <Text style={{ fontSize: 36 }}>📱</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      variant="titleMedium"
                      style={{ fontWeight: "700", color: "#1d4ed8" }}
                    >
                      カードをかざしてください
                    </Text>
                    <Text variant="bodySmall" style={{ color: "#3b82f6" }}>
                      ¥{total.toLocaleString()} · Tap to Pay
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    textColor="#ef4444"
                    compact
                    onPress={cancelPayment}
                  >
                    キャンセル
                  </Button>
                </>
              ) : (
                <>
                  <ActivityIndicator size="small" color="#1d4ed8" />
                  <Text style={{ color: "#1d4ed8", fontWeight: "600" }}>
                    {paymentStatus === "creating"
                      ? "決済準備中..."
                      : paymentStatus === "processing"
                        ? "処理中..."
                        : "確定中..."}
                  </Text>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {/* ── Android: QRコード表示エリア ──────────────────────── */}
        {isAndroid && paymentMethod === "card" && qrUrl && (
          <Card
            style={[styles.card, { backgroundColor: "#f0fdf4" }]}
            mode="outlined"
          >
            <Card.Content style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text
                variant="titleMedium"
                style={{
                  fontWeight: "700",
                  color: "#15803d",
                  marginBottom: 12,
                }}
              >
                お客様のスマホでQRを読み込んでください
              </Text>

              {/* QRコード：expo-barcode-scanner は読み取り専用のため
                  react-native-qrcode-svg を使用（要 npm install）     */}
              {/* eslint-disable-next-line @typescript-eslint/no-require-imports */}
              {(() => {
                try {
                  const QRCode =
                    require("react-native-qrcode-svg").default;
                  return (
                    <View
                      style={{
                        padding: 16,
                        backgroundColor: "#ffffff",
                        borderRadius: 12,
                        marginBottom: 12,
                      }}
                    >
                      <QRCode value={qrUrl} size={200} />
                    </View>
                  );
                } catch {
                  // パッケージ未インストール時のフォールバック
                  return (
                    <View style={styles.qrFallback}>
                      <Text style={{ fontSize: 48 }}>🔲</Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: "#71717a", marginTop: 4 }}
                      >
                        QRコード
                      </Text>
                    </View>
                  );
                }
              })()}

              <Text variant="bodySmall" style={{ color: "#15803d" }}>
                ¥{total.toLocaleString()} · Stripe Checkout
              </Text>

              {qrPolling && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <ActivityIndicator size="small" color="#15803d" />
                  <Text style={{ color: "#15803d", fontSize: 13 }}>
                    決済完了を確認中...
                  </Text>
                </View>
              )}

              {/* キャンセル */}
              <Button
                mode="outlined"
                textColor="#ef4444"
                style={{ marginTop: 12 }}
                onPress={() => {
                  setQrUrl(null);
                  setQrSessionId(null);
                  setQrPolling(false);
                }}
              >
                QRをキャンセル
              </Button>
            </Card.Content>
          </Card>
        )}

        {/* ── 支払い方法 ─────────────────────────────────────────── */}
        {/* iPad: QR表示中でなければ通常フォーム */}
        {!qrPolling && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                支払方法
              </Text>
              <SegmentedButtons
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v as PaymentMethod);
                  // 支払い方法変更時にQRをリセット
                  setQrUrl(null);
                  setQrSessionId(null);
                  setQrPolling(false);
                }}
                buttons={paymentButtons}
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
                      {"¥"}
                      {change.toLocaleString()}
                    </Text>
                  </View>
                </>
              )}

              {/* iPad QR説明文 */}
              {isIPad && paymentMethod === "card" && (
                <Text style={{ color: "#166534", fontSize: 13, marginTop: 4 }}>
                  📲 QRコードをお客様のスマホで読み取ってもらい決済します
                </Text>
              )}
            </Card.Content>
          </Card>
        )}

        {/* ── 決済ボタン ─────────────────────────────────────────── */}
        {!qrPolling && (
          <View style={styles.submitArea}>
            <Button
              mode="contained"
              icon={
                isIPhone && paymentMethod === "card"
                  ? "cellphone-nfc"
                  : (isAndroid || isIPad) && paymentMethod === "card"
                    ? "qrcode"
                    : "check-circle"
              }
              onPress={() => checkoutMutation.mutate()}
              loading={checkoutMutation.isPending || isProcessing}
              disabled={isDisabled}
              style={styles.submitButton}
              buttonColor="#1a1a2e"
              contentStyle={{ paddingVertical: 8 }}
            >
              {submitLabel}
            </Button>
          </View>
        )}

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
  containerTablet: { paddingHorizontal: "10%" },
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
  qrFallback: {
    width: 200,
    height: 200,
    backgroundColor: "#f4f4f5",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
});
