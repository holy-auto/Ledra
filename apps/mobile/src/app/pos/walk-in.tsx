import { useState, useEffect, useCallback, useMemo } from "react";
import { View, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Text,
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
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

interface MenuItem {
  id: string;
  name: string;
  unit_price: number;
  description: string | null;
  category_large: string | null;
  category_medium: string | null;
  category_small: string | null;
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

    try {
      const itemsJson = cart.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        amount: item.unitPrice * item.quantity,
      }));
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
        .select("id, name, unit_price, description, category_large, category_medium, category_small")
        .eq("tenant_id", user!.tenantId)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as MenuItem[];
    },
    enabled: !!user?.tenantId,
  });

  // メニュー検索・カテゴリフィルタ
  const [menuSearch, setMenuSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて");

  const categories = useMemo(() => {
    const unique = new Set<string>();
    for (const item of menuItems) {
      unique.add(item.category_large ?? "未分類");
    }
    return ["すべて", ...Array.from(unique).sort()];
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    let items = menuItems;
    if (selectedCategory !== "すべて") {
      const cat = selectedCategory === "未分類" ? null : selectedCategory;
      items = items.filter((i) => (i.category_large ?? null) === cat);
    }
    if (menuSearch.trim()) {
      const q = menuSearch.trim().toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [menuItems, selectedCategory, menuSearch]);

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

  const paymentSegments = (() => {
    if (isIPad) {
      return [
        { value: "cash" as const, label: "現金" },
        { value: "card" as const, label: "QR決済" },
        { value: "bank_transfer" as const, label: "振込" },
      ];
    }
    if (isIPhone) {
      return [
        { value: "cash" as const, label: "現金" },
        { value: "card" as const, label: "カード" },
        { value: "qr" as const, label: "QR" },
        { value: "bank_transfer" as const, label: "振込" },
      ];
    }
    return [
      { value: "cash" as const, label: "現金" },
      { value: "card" as const, label: "QR決済" },
      { value: "bank_transfer" as const, label: "振込" },
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
        <View style={styles.card}>
          <Text style={styles.heading}>
            メニューから追加
          </Text>
          <TextInput
            mode="outlined"
            placeholder="メニュー名で検索..."
            value={menuSearch}
            onChangeText={setMenuSearch}
            left={<TextInput.Icon icon="magnify" />}
            right={menuSearch ? <TextInput.Icon icon="close" onPress={() => setMenuSearch("")} /> : undefined}
            style={styles.searchInput}
            dense
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScroll}
            contentContainerStyle={styles.categoryScrollContent}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat}
                style={[
                  styles.categoryChip,
                  selectedCategory === cat && styles.categoryChipActive,
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text
                  style={[
                    styles.categoryChipLabel,
                    selectedCategory === cat && styles.categoryChipLabelActive,
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.menuGrid}>
            {filteredMenuItems.map((item) => (
              <Pressable
                key={item.id}
                style={styles.menuChip}
                onPress={() => addMenuItem(item)}
              >
                <Text style={styles.menuChipLabel} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.menuChipPrice}>
                  ¥{item.unit_price.toLocaleString()}
                </Text>
              </Pressable>
            ))}
            {menuItems.length === 0 && (
              <Text style={styles.emptyText}>
                メニューが未登録です
              </Text>
            )}
            {menuItems.length > 0 && filteredMenuItems.length === 0 && (
              <Text style={styles.emptyText}>
                該当するメニューがありません
              </Text>
            )}
          </View>
        </View>

        {/* カスタム品目 */}
        <View style={styles.card}>
          <Text style={styles.heading}>
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
              iconColor={colors.textPrimary}
              size={28}
              onPress={addCustomItem}
            />
          </View>
        </View>

        {/* カート明細 */}
        {cart.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              明細
            </Text>
            {cart.map((item, index) => (
              <View key={`${item.menuItemId ?? "custom"}-${index}`} style={styles.cartItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bodyText}>{item.name}</Text>
                  <Text style={styles.subText}>
                    ¥{item.unitPrice.toLocaleString()} × {item.quantity}
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <IconButton
                    icon="minus-circle-outline"
                    size={20}
                    onPress={() => updateQuantity(index, -1)}
                  />
                  <Text style={styles.qtyText}>
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
                    iconColor={colors.danger}
                    onPress={() => removeItem(index)}
                  />
                </View>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                合計
              </Text>
              <Text style={styles.totalAmount}>
                ¥{total.toLocaleString()}
              </Text>
            </View>
          </View>
        )}

        {/* QRコード表示 */}
        {(((isAndroid || isIPad) && paymentMethod === "card") ||
          (isIPhone && paymentMethod === "qr")) &&
          qrUrl && (
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>
              お客様のスマホでQRを読み込んでください
            </Text>
            <View style={styles.qrCodeWrapper}>
              <QRCode value={qrUrl} size={200} />
            </View>
            <Text style={styles.qrSubtext}>
              ¥{total.toLocaleString()} · Stripe Checkout
            </Text>
            {qrPolling && (
              <View style={styles.qrPollingRow}>
                <ActivityIndicator size="small" color={colors.successDark} />
                <Text style={styles.qrPollingText}>決済完了を確認中...</Text>
              </View>
            )}
            <LedraButton
              variant="outline"
              style={{ marginTop: spacing.md }}
              onPress={() => {
                setQrUrl(null);
                setQrSessionId(null);
                setQrPolling(false);
              }}
            >
              QRをキャンセル
            </LedraButton>
          </View>
        )}

        {/* 支払方法 */}
        {!qrPolling && cart.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              支払方法
            </Text>
            <SegmentedControl
              segments={paymentSegments}
              value={paymentMethod}
              onChange={(v) => {
                setPaymentMethod(v as PaymentMethod);
                setQrUrl(null);
                setQrSessionId(null);
                setQrPolling(false);
              }}
            />
            {paymentMethod === "cash" && (
              <>
                <TextInput
                  mode="outlined"
                  label="お預かり金額"
                  value={receivedAmount}
                  onChangeText={setReceivedAmount}
                  keyboardType="numeric"
                  style={styles.cashInput}
                  right={<TextInput.Affix text="円" />}
                />
                <View style={styles.changeRow}>
                  <Text style={styles.bodyText}>おつり:</Text>
                  <Text
                    style={[
                      styles.totalLabel,
                      { color: change >= 0 ? colors.success : colors.danger },
                    ]}
                  >
                    ¥{change.toLocaleString()}
                  </Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* 決済ボタン */}
        {!qrPolling && cart.length > 0 && (
          <View style={styles.submitArea}>
            <LedraButton
              icon="check-circle"
              onPress={handleCheckout}
              loading={processing || isProcessing}
              disabled={isDisabled}
            >
              {submitLabel}
            </LedraButton>
          </View>
        )}

        <View style={{ height: spacing["4xl"] }} />
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
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
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  searchInput: {
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  categoryScroll: {
    marginBottom: spacing.md,
    marginHorizontal: -spacing.xs,
  },
  categoryScrollContent: {
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceVariant,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipLabel: {
    ...typography.labelSmall,
    color: colors.textSecondary,
  },
  categoryChipLabelActive: {
    color: colors.textOnPrimary,
  },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  menuChip: {
    backgroundColor: colors.surfaceVariant,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuChipLabel: {
    ...typography.label,
    color: colors.textPrimary,
  },
  menuChipPrice: {
    ...typography.meta,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  input: { backgroundColor: colors.surface },
  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  qtyText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  totalAmount: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  qrCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.successLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: "center",
    ...shadows.card,
  },
  qrTitle: {
    ...typography.titleMedium,
    color: colors.successDark,
    marginBottom: spacing.md,
  },
  qrCodeWrapper: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  qrSubtext: {
    ...typography.bodySmall,
    color: colors.successDark,
  },
  qrPollingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  qrPollingText: {
    ...typography.meta,
    color: colors.successDark,
  },
  cashInput: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  submitArea: { padding: spacing.lg },
});
