import { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Text,
  Card,
  Button,
  Divider,
  SegmentedButtons,
  TextInput,
  ActivityIndicator,
  Snackbar,
  IconButton,
} from "react-native-paper";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalStore } from "@/stores/terminalStore";

interface MenuItem {
  id: string;
  name: string;
  unit_price: number;
  description: string | null;
}

interface CartItem {
  menuItemId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
}

type PaymentMethod = "cash" | "card" | "qr" | "bank_transfer";

function useDeviceType() {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") {
      const { width, height } =
        require("react-native").Dimensions.get("window");
      setIsTablet(Math.min(width, height) >= 768);
    }
  }, []);

  const os = Platform.OS;
  const isIPhone = os === "ios" && !isTablet;
  const isIPad = os === "ios" && isTablet;
  const isAndroid = os === "android";

  return { isIPhone, isIPad, isAndroid };
}

function useQrPaymentPoller(
  sessionId: string | null,
  onPaid: () => void,
) {
  useEffect(() => {
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      while (active) {
        await new Promise((r) => setTimeout(r, 3000));
        try {
          const res = await mobileApi<{ status: string }>(
            `/pos/checkout/qr-status?session_id=${sessionId}`,
          );
          if (res.status === "paid" && active) {
            active = false;
            onPaid();
          }
        } catch {
          // ignore
        }
      }
    };
    poll();
    return () => {
      active = false;
    };
  }, [sessionId, onPaid]);
}

export default function WalkInCheckoutScreen() {
  const { user, selectedStore } = useAuthStore();
  const { isIPhone, isIPad, isAndroid } = useDeviceType();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [processing, setProcessing] = useState(false);

  // total / received / change を上に移動 (React Compiler の temporal-dead-zone
  // エラー回避: onQrPaid useCallback が total を参照するため)
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart],
  );
  const received = parseInt(receivedAmount, 10) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - total) : 0;
  const [snackbar, setSnackbar] = useState("");

  // QR決済用
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);

  // Stripe Terminal（iPhone）
  const {
    readerStatus,
    readerError,
    paymentStatus,
    connectTapToPay,
    initTerminal,
    processCardPayment,
    cancelPayment,
    resetPayment,
  } = useTerminal();

  useEffect(() => {
    if (isIPhone) initTerminal();
  }, [isIPhone]);

  const onQrPaid = useCallback(async () => {
    setQrPolling(false);
    resetPayment();

    // Stripe側で決済成功 → DBにも payments/documents を記録
    try {
      const itemsJson = cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.unitPrice * item.quantity,
      }));
      // 任意UUIDは空文字列だと PG が "invalid input syntax for type uuid"
      // で落ちるため明示的に null に正規化する。
      // 店舗未設定（select-store の "店舗が登録されていません" 経路）で
      // selectedStore.id が "" になる現象の保険。
      const { data, error } = await supabase.rpc("pos_checkout", {
        p_tenant_id: user!.tenantId,
        p_reservation_id: null,
        p_customer_id: null,
        p_store_id: selectedStore?.id || null,
        p_register_session_id: null,
        p_payment_method: "card",
        p_amount: total,
        p_received_amount: total,
        p_items_json: itemsJson,
        p_user_id: user!.id,
      });
      if (error) throw error;
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const pId = result?.payment_id;
      if (pId) {
        router.replace(`/pos/receipt-standalone/${pId}`);
        return;
      }
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : "決済記録に失敗しました");
    }
    router.replace("/(tabs)");
  }, [cart, total, user, selectedStore, resetPayment]);

  useQrPaymentPoller(qrPolling ? qrSessionId : null, onQrPaid);

  // メニュー取得
  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu-items", user?.tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, unit_price, description")
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as MenuItem[];
    },
    enabled: !!user?.tenantId,
  });

  function addMenuItem(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.menuItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.menuItemId === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        { menuItemId: item.id, name: item.name, unitPrice: item.unit_price, quantity: 1 },
      ];
    });
  }

  function addCustomItem() {
    const price = parseInt(customPrice, 10);
    if (!customName.trim() || isNaN(price) || price <= 0) {
      setSnackbar("品名と金額を正しく入力してください");
      return;
    }
    setCart((prev) => [
      ...prev,
      { menuItemId: null, name: customName.trim(), unitPrice: price, quantity: 1 },
    ]);
    setCustomName("");
    setCustomPrice("");
  }

  function removeItem(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  function updateQuantity(index: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }

  async function handleCheckout() {
    if (cart.length === 0 || total <= 0) {
      setSnackbar("明細を追加してください");
      return;
    }

    setProcessing(true);

    try {
      const itemsJson = cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.unitPrice * item.quantity,
      }));

      // iPhone Tap to Pay
      if (isIPhone && paymentMethod === "card") {
        if (readerStatus !== "connected") {
          const ok = await connectTapToPay();
          if (!ok) {
            const latestErr =
              useTerminalStore.getState().readerError ?? readerError;
            throw new Error(
              latestErr ?? "Tap to Pay の準備ができませんでした"
            );
          }
        }
        const result = await processCardPayment({
          amountJpy: total,
          description: "Ledra POS - ウォークイン会計",
          storeId: selectedStore?.id || "",
          tenantId: user!.tenantId,
        });
        if (!result.success) {
          if (result.cancelled) {
            setProcessing(false);
            return;
          }
          throw new Error(result.error ?? "カード決済失敗");
        }
      }

      // QR決済（iPad/Android「カード」 or iPhone「QR」）
      const isQrFlow =
        ((isAndroid || isIPad) && paymentMethod === "card") ||
        (isIPhone && paymentMethod === "qr");
      if (isQrFlow) {
        const res = await mobileApi<{ url: string; session_id: string }>(
          "/pos/checkout/qr-session",
          {
            method: "POST",
            body: {
              amount: total,
              tenant_id: user!.tenantId,
              store_id: selectedStore?.id ?? "",
            },
          },
        );
        setQrUrl(res.url);
        setQrSessionId(res.session_id);
        setQrPolling(true);
        setProcessing(false);
        return;
      }

      // pos_checkout RPC呼び出し（予約なし）
      // 任意UUIDは空文字列だと PG が "invalid input syntax for type uuid"
      // で落ちるため明示的に null に正規化する。
      const { data, error } = await supabase.rpc("pos_checkout", {
        p_tenant_id: user!.tenantId,
        p_reservation_id: null,
        p_customer_id: null,
        p_store_id: selectedStore?.id || null,
        p_register_session_id: null,
        p_payment_method: paymentMethod,
        p_amount: total,
        p_received_amount: paymentMethod === "cash" ? received : total,
        p_items_json: itemsJson,
        p_user_id: user!.id,
      });

      if (error) throw error;

      resetPayment();
      const result = typeof data === "string" ? JSON.parse(data) : data;
      const pId = result?.payment_id;
      if (pId) {
        router.replace(`/pos/receipt-standalone/${pId}`);
      } else {
        router.replace("/(tabs)");
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ||
            (err as { details?: string })?.details ||
            JSON.stringify(err) ||
            "決済に失敗しました";
      setSnackbar(msg);
    } finally {
      setProcessing(false);
    }
  }

  const paymentButtons = (() => {
    if (isIPad) {
      return [
        { value: "cash", label: "現金" },
        { value: "card", label: "QR決済" },
        { value: "bank_transfer", label: "振込" },
      ];
    }
    if (isIPhone) {
      // iPhone: Tap to Pay は専用ボタン (TapToPayButton) で上部に表示
      return [
        { value: "cash", label: "現金" },
        { value: "card", label: "カード" },
        { value: "qr", label: "QR" },
        { value: "bank_transfer", label: "振込" },
      ];
    }
    return [
      { value: "cash", label: "現金" },
      { value: "card", label: "QR決済" },
      { value: "bank_transfer", label: "振込" },
    ];
  })();

  const isProcessing =
    paymentStatus === "collecting" ||
    paymentStatus === "processing" ||
    paymentStatus === "capturing" ||
    paymentStatus === "creating";

  const isDisabled =
    processing ||
    isProcessing ||
    qrPolling ||
    cart.length === 0 ||
    total <= 0 ||
    (paymentMethod === "cash" && received < total);

  const submitLabel = (() => {
    if (qrPolling) return "お客様の決済完了を待っています...";
    if (isIPhone && paymentMethod === "card") {
      if (paymentStatus === "collecting") return "カードをかざしてください";
      if (isProcessing) return "処理中...";
      return "Tap to Pay で決済";
    }
    if ((isAndroid || isIPad) && paymentMethod === "card") return "QRコードを表示";
    if (isIPhone && paymentMethod === "qr") return "QRコードを表示";
    return "決済確定";
  })();

  return (
    <>
      <Stack.Screen options={{ title: "ウォークイン会計" }} />
      <ScrollView style={styles.container}>
        {/* メニューから追加 */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              メニューから追加
            </Text>
            <View style={styles.menuGrid}>
              {menuItems.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.menuChip}
                  onPress={() => addMenuItem(item)}
                >
                  <Text variant="labelMedium" style={styles.menuChipLabel} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text variant="labelSmall" style={styles.menuChipPrice}>
                    ¥{item.unit_price.toLocaleString()}
                  </Text>
                </Pressable>
              ))}
              {menuItems.length === 0 && (
                <Text variant="bodySmall" style={styles.emptyText}>
                  メニューが未登録です
                </Text>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* カスタム品目 */}
        <Card style={styles.card} mode="outlined">
          <Card.Content>
            <Text variant="titleMedium" style={styles.heading}>
              カスタム品目
            </Text>
            <View style={styles.customRow}>
              <TextInput
                mode="outlined"
                label="品名"
                value={customName}
                onChangeText={setCustomName}
                style={[styles.input, { flex: 2 }]}
                dense
              />
              <TextInput
                mode="outlined"
                label="金額"
                value={customPrice}
                onChangeText={setCustomPrice}
                keyboardType="numeric"
                style={[styles.input, { flex: 1 }]}
                right={<TextInput.Affix text="円" />}
                dense
              />
              <IconButton
                icon="plus-circle"
                iconColor="#1a1a2e"
                size={28}
                onPress={addCustomItem}
              />
            </View>
          </Card.Content>
        </Card>

        {/* カート明細 */}
        {cart.length > 0 && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                明細
              </Text>
              {cart.map((item, index) => (
                <View key={`${item.menuItemId ?? "custom"}-${index}`} style={styles.cartItem}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">{item.name}</Text>
                    <Text variant="bodySmall" style={styles.subText}>
                      ¥{item.unitPrice.toLocaleString()} × {item.quantity}
                    </Text>
                  </View>
                  <View style={styles.qtyControls}>
                    <IconButton
                      icon="minus-circle-outline"
                      size={20}
                      onPress={() => updateQuantity(index, -1)}
                    />
                    <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                      {item.quantity}
                    </Text>
                    <IconButton
                      icon="plus-circle-outline"
                      size={20}
                      onPress={() => updateQuantity(index, 1)}
                    />
                    <IconButton
                      icon="delete-outline"
                      size={20}
                      iconColor="#ef4444"
                      onPress={() => removeItem(index)}
                    />
                  </View>
                </View>
              ))}
              <Divider style={{ marginVertical: 12 }} />
              <View style={styles.totalRow}>
                <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                  合計
                </Text>
                <Text variant="headlineSmall" style={{ fontWeight: "700", color: "#1a1a2e" }}>
                  ¥{total.toLocaleString()}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* QRコード表示 */}
        {(((isAndroid || isIPad) && paymentMethod === "card") ||
          (isIPhone && paymentMethod === "qr")) &&
          qrUrl && (
          <Card style={[styles.card, { backgroundColor: "#f0fdf4" }]} mode="outlined">
            <Card.Content style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text variant="titleMedium" style={{ fontWeight: "700", color: "#15803d", marginBottom: 12 }}>
                お客様のスマホでQRを読み込んでください
              </Text>
              <View style={{ padding: 16, backgroundColor: "#ffffff", borderRadius: 12, marginBottom: 12 }}>
                <QRCode value={qrUrl} size={200} />
              </View>
              <Text variant="bodySmall" style={{ color: "#15803d" }}>
                ¥{total.toLocaleString()} · Stripe Checkout
              </Text>
              {qrPolling && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                  <ActivityIndicator size="small" color="#15803d" />
                  <Text style={{ color: "#15803d", fontSize: 13 }}>決済完了を確認中...</Text>
                </View>
              )}
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

        {/* 支払方法 */}
        {!qrPolling && cart.length > 0 && (
          <Card style={styles.card} mode="outlined">
            <Card.Content>
              <Text variant="titleMedium" style={styles.heading}>
                支払方法
              </Text>
              <SegmentedButtons
                value={paymentMethod}
                onValueChange={(v) => {
                  setPaymentMethod(v as PaymentMethod);
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
                      style={{ fontWeight: "700", color: change >= 0 ? "#10b981" : "#ef4444" }}
                    >
                      ¥{change.toLocaleString()}
                    </Text>
                  </View>
                </>
              )}
            </Card.Content>
          </Card>
        )}

        {/* 決済ボタン */}
        {!qrPolling && cart.length > 0 && (
          <View style={styles.submitArea}>
            <Button
              mode="contained"
              icon="check-circle"
              onPress={handleCheckout}
              loading={processing || isProcessing}
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

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar("")} duration={3000}>
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fafafa" },
  card: { marginHorizontal: 16, marginTop: 16, backgroundColor: "#ffffff" },
  heading: { fontWeight: "700", color: "#1a1a2e", marginBottom: 8 },
  subText: { color: "#71717a" },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  menuChip: {
    backgroundColor: "#f4f4f5",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e4e4e7",
  },
  menuChipLabel: { color: "#1a1a2e", fontWeight: "600" },
  menuChipPrice: { color: "#71717a", marginTop: 2 },
  emptyText: { color: "#71717a" },
  customRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { backgroundColor: "#ffffff" },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
