import { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Platform } from "react-native";
import {
  Text,
  TextInput,
  ActivityIndicator,
  Snackbar,
} from "react-native-paper";
import { useLocalSearchParams, router, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { toPosItems } from "@/lib/pos";
import { parseMenuItems, menuItemsTotal, hasUnknownPrice } from "@/lib/reservationItems";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { useQrPaymentPoller } from "@/hooks/useQrPaymentPoller";
import { CardEntryPanel } from "@/components/CardEntryPanel";
import { useDeviceType } from "@/hooks/useDeviceType";
import {
  paymentSegments,
  isQrFlow,
  isTapToPayFlow,
  isTerminalBusy,
  shouldOfferCardEntry,
  recordedMethod,
} from "@/lib/posPayment";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalStore } from "@/stores/terminalStore";
import { TapToPayButton } from "@/components/TapToPayButton";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { colors, spacing, radius, typography, shadows } from "@/constants/tokens";

// ─────────────────────────────────────────────────────────────
// 端末種別の判定
// ─────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────
export default function PosCheckoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, selectedStore } = useAuthStore();
  const device = useDeviceType();
  const { isIPhone, isIPad, isAndroid } = device;

  const defaultMethod: PaymentMethod = "cash";
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>(defaultMethod);
  const [receivedAmount, setReceivedAmount] = useState("");
  const [snackbar, setSnackbar] = useState("");

  // QR決済用（Android）
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  // タッチ決済が読めなかった直後だけ、カード番号入力への導線を出す
  const [tapFailed, setTapFailed] = useState(false);
  // その導線から始めた決済か。**カードとして記録する**ため（QR ではない）
  const [cardEntry, setCardEntry] = useState(false);

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

  const items = parseMenuItems(reservation?.menu_items_json);
  const total = menuItemsTotal(items);
  // 金額を確定できない明細があるとき、合計は実際より小さい。決済させない
  const priceUnknown = hasUnknownPrice(items);
  const received = parseInt(receivedAmount, 10) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - total) : 0;

  // QRポーリング
  // ハンドラの同一性が変わるとポーリングが毎回作り直され、3 秒待ちが
  // 振り出しに戻る。useCallback で固定する（ウォークイン画面も同じ形）
  //
  // **ここで会計を記録する。** 以前は記録せずレシート画面へ飛ばしていたので、
  // カードは切られているのに payments に1行も残らなかった（レシートも出ない）。
  // Stripe の webhook 側にも POS の Checkout を受ける処理は無い
  const onQrPaid = useCallback(async () => {
    setQrPolling(false);
    resetPayment();
    try {
      await mobileApi("/pos/checkout", {
        method: "POST",
        body: {
          reservation_id: id || null,
          store_id: selectedStore?.id || null,
          // タッチ決済の代わりに始めた分は、実体がカードなので card で残す
          payment_method: recordedMethod(paymentMethod, cardEntry),
          amount: total,
          received_amount: total,
          items_json: toPosItems(items),
        },
      });
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : "決済記録に失敗しました");
    }
    router.replace(`/pos/receipt/${id}`);
  }, [id, selectedStore, paymentMethod, cardEntry, total, items, resetPayment]);
  useQrPaymentPoller(qrPolling ? qrSessionId : null, onQrPaid);

  /**
   * Stripe Checkout のセッションを作って QR を出す。
   * 通常の QR 決済と、タッチ決済が読めなかった時の逃げ道の**両方**から呼ぶ。
   */
  const startCardEntry = useCallback(
    async (fromTapFailure: boolean) => {
      const res = await mobileApi<{ url: string; session_id: string }>("/pos/checkout/qr-session", {
        method: "POST",
        body: {
          amount: total,
          reservation_id: id,
          tenant_id: user!.tenantId,
          store_id: selectedStore?.id ?? "",
        },
      });
      setCardEntry(fromTapFailure);
      setTapFailed(false);
      setQrUrl(res.url);
      setQrSessionId(res.session_id);
      setQrPolling(true);
    },
    [total, id, user, selectedStore],
  );

  // ── 決済ミューテーション ───────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // A. iPhone: Tap to Pay
      if (isTapToPayFlow(device, paymentMethod)) {
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
        // 明細は capture（= サーバ側の pos_checkout）へ渡す。ここで別途
        // pos_checkout を呼ぶと1回の決済で支払が2件できる
        const result = await processCardPayment({
          amountJpy: total,
          description: `Ledra POS - ${reservation?.customer?.name ?? "会計"}`,
          reservationId: id,
          storeId: selectedStore?.id || "",
          tenantId: user!.tenantId,
          itemsJson: toPosItems(items),
        });
        if (!result.success) {
          // 取り消しは失敗ではないが**会計は成立していない**。
          // ここで素通りさせると onSuccess がレシート画面へ飛ばしてしまう
          if (result.cancelled) return "cancelled" as const;
          throw new Error(result.error ?? "カード決済失敗");
        }
        return;
      }

      // B. QRコード決済
      const qrFlow = isQrFlow(device, paymentMethod);
      if (qrFlow) {
        await startCardEntry(false);
        return;
      }

      // C. 現金・QR(支払方法記録)・振込
      // pos_checkout は呼び出し元を検査しないため端末からは直接呼ばない。
      // テナントと担当者はサーバがトークンから決める
      await mobileApi("/pos/checkout", {
        method: "POST",
        body: {
          reservation_id: id || null,
          store_id: selectedStore?.id || null,
          payment_method: paymentMethod,
          amount: total,
          received_amount: paymentMethod === "cash" ? received : total,
          items_json: toPosItems(items),
        },
      });
    },
    onSuccess: (result) => {
      if (result === "cancelled") return;
      const qrFlow = isQrFlow(device, paymentMethod);
      if (qrFlow) return;
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
      // タッチ決済が読めなかったときだけ、カード番号入力への導線を出す
      if (isTapToPayFlow(device, paymentMethod)) setTapFailed(true);
    },
  });

  // ── 支払い方法ボタン定義（端末別） ────────────────────────────
  const segments = paymentSegments(device);

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
  const isProcessing = isTerminalBusy(paymentStatus);

  const isDisabled =
    checkoutMutation.isPending ||
    isProcessing ||
    qrPolling ||
    // 明細が無い・金額が読めない状態で押せると ¥0 の売上が立つ
    total <= 0 ||
    priceUnknown ||
    (paymentMethod === "cash" && received < total);

  // ── 決済ボタンラベル ──────────────────────────────────────────
  const submitLabel = (() => {
    if (priceUnknown) return "金額が確定できません（管理画面で確認）";
    if (total <= 0) return "明細がありません";
    if (qrPolling) return "お客様の決済完了を待っています...";
    if (isTapToPayFlow(device, paymentMethod)) {
      if (paymentStatus === "collecting") return "カードをかざしてください";
      if (isProcessing) return "処理中...";
      return "Tap to Pay で決済";
    }
    if (isQrFlow(device, paymentMethod)) return "QRコードを表示";
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
              {item.quantity !== 1 && <Text style={styles.subText}>x{item.quantity}</Text>}
              <Text style={styles.price}>
                {item.amount === null ? "金額不明" : `¥${item.amount.toLocaleString()}`}
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
        {isTapToPayFlow(device, paymentMethod) && isProcessing && (
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

        {/* ── タッチ決済が読めなかったときの逃げ道 ──── */}
        {shouldOfferCardEntry(device, paymentMethod, tapFailed, !!qrUrl) && (
          <View style={styles.tapFailedCard}>
            <Text style={styles.tapFailedTitle}>タッチ決済ができませんでした</Text>
            <Text style={styles.tapFailedDesc}>
              カード番号を入力して決済に切り替えられます。
            </Text>
            <LedraButton
              style={{ marginTop: spacing.md, alignSelf: "stretch" }}
              onPress={async () => {
                try {
                  await startCardEntry(true);
                } catch (err) {
                  setSnackbar(err instanceof Error ? err.message : "決済リンクを作れませんでした");
                }
              }}
            >
              カード番号で決済する
            </LedraButton>
          </View>
        )}

        {/* ── カード番号入力（Stripe Checkout） ──── */}
        {qrUrl && (
          <CardEntryPanel
            url={qrUrl}
            amount={total}
            polling={qrPolling}
            onCancel={() => {
              setQrUrl(null);
              setQrSessionId(null);
              setQrPolling(false);
              setCardEntry(false);
            }}
          />
        )}

        {/* ── 支払い方法 ─────────────────────────────────────────── */}
        {!qrPolling && (
          <View style={styles.card}>
            <Text style={styles.heading}>
              支払方法
            </Text>
            <SegmentedControl
              segments={segments}
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
                isTapToPayFlow(device, paymentMethod)
                  ? "contactless-payment"
                  : isQrFlow(device, paymentMethod)
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
  tapFailedCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadows.card,
  },
  tapFailedTitle: { ...typography.titleMedium, color: colors.textPrimary },
  tapFailedDesc: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  // iPad QR hint
  ipadQrHint: {
    ...typography.meta,
    color: colors.successDark,
    marginTop: spacing.xs,
  },
});
