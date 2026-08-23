import { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
  Text,
  TextInput,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { parseMenuItems, menuItemsTotal } from "@/lib/reservationItems";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalStore } from "@/stores/terminalStore";
import { TapToPayButton } from "@/components/TapToPayButton";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

// ─────────────────────────────────────────────────────────────
// 端末種別の判定
// ─────────────────────────────────────────────────────────────
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

  return { isIPhone, isIPad, isAndroid, isTablet };
}

// ─────────────────────────────────────────────────────────────

interface ReservationCheckout {
  id: string;
  status: string;
  payment_status: string;
  customer: { name: string } | null;
  vehicle: { plate_display: string } | null;
  menu_items_json: unknown;
}

type PaymentMethod = "cash" | "card" | "qr" | "bank_transfer";

// ─────────────────────────────────────────────────────────────
// QR決済ポーリング
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
  const { isIPhone, isIPad, isAndroid } = useDeviceType();

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
    readerError,
    paymentStatus,
    connectTapToPay,
    initTerminal,
    processCardPayment,
    cancelPayment,
    resetPayment,
  } = useTerminal();

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
          vehicle:vehicles(plate_display),
          // 明細は menu_items_json（reservation_items テーブルは存在しない）
          menu_items_json
        `
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as unknown as ReservationCheckout;
    },
    enabled: !!id,
  });

  // menu_items_json は 1 行 1 点で数量を持たない
  const items = parseMenuItems(reservation?.menu_items_json);
  const total = menuItemsTotal(items);
  const received = parseInt(receivedAmount, 10) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - total) : 0;

  // ── 決済ミューテーション ───────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // A. iPhone: Tap to Pay
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
          description: `Ledra POS - ${reservation?.customer?.name ?? "会計"}`,
          reservationId: id,
          storeId: selectedStore?.id || "",
          tenantId: user!.tenantId,
        });
        if (!result.success) {
          if (result.cancelled) return;
          throw new Error(result.error ?? "カード決済失敗");
        }
        // menu_items_json は 1 行 1 点。数量は常に 1
        const itemsJson = items.map((it) => ({
          name: it.name,
          quantity: 1,
          unit_price: it.price,
          amount: it.price,
        }));
        const { error } = await supabase.rpc("pos_checkout", {
          p_tenant_id: user!.tenantId,
          p_reservation_id: id || null,
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
        return;
      }

      // B. QRコード決済
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
              reservation_id: id,
              tenant_id: user!.tenantId,
              store_id: selectedStore?.id ?? "",
            },
          }
        );
        setQrUrl(res.url);
        setQrSessionId(res.session_id);
        setQrPolling(true);
        return;
      }

      // C. 現金・QR(支払方法記録)・振込
      // menu_items_json は 1 行 1 点。数量は常に 1
      const itemsJson = items.map((it) => ({
        name: it.name,
        quantity: 1,
        unit_price: it.price,
        amount: it.price,
      }));
      const { error } = await supabase.rpc("pos_checkout", {
        p_tenant_id: user!.tenantId,
        p_reservation_id: id || null,
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
    },
    onSuccess: () => {
      const isQrFlow =
        ((isAndroid || isIPad) && paymentMethod === "card") ||
        (isIPhone && paymentMethod === "qr");
      if (isQrFlow) return;
      resetPayment();
      router.replace(`/pos/receipt/${id}`);
    },
    onError: (err) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ||
            (err as { details?: string })?.details ||
            JSON.stringify(err) ||
            "決済に失敗しました";
      setSnackbar(msg);
    },
  });

  // ── 支払い方法ボタン定義（端末別） ────────────────────────────
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
    if (isIPhone && paymentMethod === "qr") return "QRコードを表示";
    return "決済確定";
  })();

  return (
    <>
      <Stack.Screen options={{ title: "会計" }} />
      <ScrollView style={[styles.container, isIPad && styles.containerTablet]}>

        {/* ── iPad モード バナー ────────────────────────────────── */}
        {isIPad && (
          <View style={styles.ipadBanner}>
            <Text style={{ fontSize: 20 }}>🖥️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.ipadBannerTitle}>
                iPad モード
              </Text>
              <Text style={styles.ipadBannerSub}>
                カード決済はQRコードでお客様スマホから受け付けます
              </Text>
            </View>
          </View>
        )}

        {/* ── 顧客・車両 ───────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            {reservation.customer?.name ?? "顧客不明"}
          </Text>
          <Text style={styles.subText}>
            {reservation.vehicle?.plate_display ?? ""}
          </Text>
        </View>

        {/* ── 明細 ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.heading}>
            明細
          </Text>
          {items.map((item, i) => (
            <View key={`${item.menu_item_id ?? item.name}-${i}`} style={styles.lineItem}>
              <Text style={[styles.bodyText, { flex: 1 }]}>{item.name}</Text>
              <Text style={styles.price}>
                {"¥"}
                {item.price.toLocaleString()}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.lineItem}>
            <Text style={[styles.totalLabel, { flex: 1 }]}>
              合計
            </Text>
            <Text style={styles.totalAmount}>
              {"¥"}
              {total.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* ── iPhone: Tap to Pay 専用ボタン ───────
             TapToPayButton component left as-is per task instructions */}
        {isIPhone && !qrPolling && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
            <TapToPayButton
              amountLabel={`¥${total.toLocaleString()}`}
              state={
                paymentStatus === "collecting"
                  ? "collecting"
                  : isProcessing
                    ? "processing"
                    : readerStatus === "connecting"
                      ? "initializing"
                      : "idle"
              }
              disabled={checkoutMutation.isPending}
              onPress={() => {
                setPaymentMethod("card");
                checkoutMutation.mutate();
              }}
            />
          </View>
        )}

        {/* ── iPhone: Tap to Pay ステータス ────────────────────── */}
        {isIPhone && paymentMethod === "card" && isProcessing && (
          <View style={styles.tapToPayStatus}>
            {paymentStatus === "collecting" ? (
              <>
                <Text style={{ fontSize: 36 }}>📱</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tapToPayTitle}>
                    カードをかざしてください
                  </Text>
                  <Text style={styles.tapToPaySub}>
                    ¥{total.toLocaleString()} · Tap to Pay
                  </Text>
                </View>
                <LedraButton
                  variant="outline"
                  size="small"
                  onPress={cancelPayment}
                  fullWidth={false}
                >
                  キャンセル
                </LedraButton>
              </>
            ) : (
              <>
                <ActivityIndicator size="small" color={colors.primaryDark} />
                <Text style={styles.tapToPayProcessing}>
                  {paymentStatus === "creating"
                    ? "決済準備中..."
                    : paymentStatus === "processing"
                      ? "処理中..."
                      : "確定中..."}
                </Text>
              </>
            )}
          </View>
        )}

        {/* ── QRコード表示エリア ──── */}
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
                <Text style={styles.qrPollingText}>
                  決済完了を確認中...
                </Text>
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

        {/* ── 支払い方法 ─────────────────────────────────────────── */}
        {!qrPolling && (
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
                    {"¥"}
                    {change.toLocaleString()}
                  </Text>
                </View>
              </>
            )}

            {/* iPad QR説明文 */}
            {isIPad && paymentMethod === "card" && (
              <Text style={styles.ipadQrHint}>
                📲 QRコードをお客様のスマホで読み取ってもらい決済します
              </Text>
            )}
          </View>
        )}

        {/* ── 決済ボタン ─────────────────────────────────────────── */}
        {!qrPolling && (
          <View style={styles.submitArea}>
            <LedraButton
              icon={
                isIPhone && paymentMethod === "card"
                  ? "contactless-payment"
                  : (isAndroid || isIPad) && paymentMethod === "card"
                    ? "qrcode"
                    : "check-circle"
              }
              onPress={() => checkoutMutation.mutate()}
              loading={checkoutMutation.isPending || isProcessing}
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
  containerTablet: { paddingHorizontal: "10%" },
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
  subText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
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
  lineItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  totalLabel: {
    ...typography.titleMedium,
    color: colors.textPrimary,
  },
  totalAmount: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  cashInput: {
    backgroundColor: colors.surface,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  submitArea: { padding: spacing.lg },
  // iPad banner
  ipadBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.card,
  },
  ipadBannerTitle: {
    ...typography.titleSmall,
    color: colors.primaryDark,
  },
  ipadBannerSub: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  // Tap to Pay status
  tapToPayStatus: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.card,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    ...shadows.card,
  },
  tapToPayTitle: {
    ...typography.titleMedium,
    color: colors.primaryDark,
  },
  tapToPaySub: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  tapToPayProcessing: {
    ...typography.body,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  // QR card
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
  // iPad QR hint
  ipadQrHint: {
    ...typography.meta,
    color: colors.successDark,
    marginTop: spacing.xs,
  },
});
