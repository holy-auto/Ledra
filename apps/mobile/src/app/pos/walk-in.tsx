import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Platform,
  BackHandler,
  useWindowDimensions,
} from "react-native";
import {
  Text,
  TextInput,
  Snackbar,
  IconButton,
  Icon,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";
import { paymentIdOf, toPosItems } from "@/lib/pos";
import { useAuthStore } from "@/stores/authStore";
import { mobileApi } from "@/lib/api";
import { useCardEntry } from "@/hooks/useCardEntry";
import { CardEntryPanel } from "@/components/CardEntryPanel";
import { PosNoticeCard } from "@/components/PosNoticeCard";
import { TapToPayButton } from "@/components/TapToPayButton";
import { useDeviceType } from "@/hooks/useDeviceType";
import { paymentSegments, isQrFlow, isTapToPayFlow, isTerminalBusy, tapFailureAction } from "@/lib/posPayment";
import { useTerminal } from "@/hooks/useTerminal";
import { useTerminalStore } from "@/stores/terminalStore";
import { LedraButton, SegmentedControl } from "@/components/ui";
import { padToColumns } from "@/lib/menuFilter";
import {
  useMenuFilter,
  MenuFilterBar,
  MenuTile,
  MenuTileSpacer,
} from "@/components/MenuPicker";
import { colors, spacing, radius, sizing, typography, shadows } from "@/constants/tokens";
import { useMenuItems } from "@/hooks/useMenuItems";

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

export default function WalkInCheckoutScreen() {
  const { user, selectedStore } = useAuthStore();
  const device = useDeviceType();
  const { isIPhone, isIPad, isAndroid } = device;
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // POS レジ同様、品目選択と会計を 2 ステップに分ける（1 画面に積むと品数増加で破綻する）
  const [step, setStep] = useState<"menu" | "checkout">("menu");
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
  const itemCount = useMemo(
    () => cart.reduce((n, item) => n + item.quantity, 0),
    [cart],
  );
  // タイルに数量バッジを出すための menuItemId → 数量
  const cartQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) if (c.menuItemId) m.set(c.menuItemId, c.quantity);
    return m;
  }, [cart]);
  const received = parseInt(receivedAmount, 10) || 0;
  const change = paymentMethod === "cash" ? Math.max(0, received - total) : 0;
  const [snackbar, setSnackbar] = useState("");

  // QR決済用
  // タッチ決済が読めなかった直後だけ、カード番号入力への導線を出す
  const [tapFailed, setTapFailed] = useState(false);

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

  // カード番号入力（Stripe Checkout）。金額の固定・記録・失効はフック側が持つ
  const cardEntry = useCardEntry(
    useCallback(
      (paymentId: string | null) => {
        resetPayment();
        router.replace(paymentId ? `/pos/receipt-standalone/${paymentId}` : "/(tabs)");
      },
      [resetPayment],
    ),
  );

  const startCardEntry = useCallback(
    (fromTapFailure: boolean) =>
      cardEntry.start(
        {
          amount: total,
          items: toPosItems(cart),
          method: paymentMethod,
          storeId: selectedStore?.id ?? null,
        },
        fromTapFailure,
      ),
    [cardEntry, total, cart, paymentMethod, selectedStore],
  );

  // 会計ステップでの端末バックは画面を閉じずに品目選択へ戻す。
  // そのまま pop させるとカートが黙って消える
  useEffect(() => {
    if (step !== "checkout") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setStep("menu");
      return true;
    });
    return () => sub.remove();
  }, [step]);

  // メニュー取得
  const { data: menuItems = [] } = useMenuItems();

  // 検索・カテゴリの絞り込みは飛び込み受付と共通（components/MenuPicker）
  const {
    search: menuSearch,
    setSearch: setMenuSearch,
    categories,
    activeCategory,
    changeCategory,
    filtered: filteredMenuItems,
  } = useMenuFilter(menuItems);

  const numColumns = windowWidth >= 700 ? 4 : windowWidth >= 500 ? 3 : 2;

  const gridData = useMemo(
    () => padToColumns(filteredMenuItems, numColumns),
    [filteredMenuItems, numColumns],
  );

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

  /**
   * 会計を実行する。
   *
   * methodOverride を受けるのは、Tap to Pay 専用ボタン（要件 5.1/5.2/5.5）から
   * 呼ぶため。setPaymentMethod は次のレンダーまで反映されないので、
   * 「支払方法をカードにしてから handleCheckout()」を同じ tick で書くと
   * 直前の paymentMethod を読んでしまう。渡された方を優先する。
   */
  async function handleCheckout(methodOverride?: PaymentMethod) {
    const method = methodOverride ?? paymentMethod;
    if (cart.length === 0 || total <= 0) {
      setSnackbar("明細を追加してください");
      return;
    }

    setProcessing(true);

    try {
      const itemsJson = toPosItems(cart);

      // iPhone Tap to Pay
      if (isTapToPayFlow(device, method)) {
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
        // 明細は capture（= サーバ側の pos_checkout）へ渡す。**ここで終える**。
        // 以前は下の会計処理まで落ちていたため、1回の決済で支払が2件できていた
        const result = await processCardPayment({
          amountJpy: total,
          description: "Ledra POS - ウォークイン会計",
          storeId: selectedStore?.id || "",
          tenantId: user!.tenantId,
          itemsJson,
        });
        if (!result.success) {
          if (result.cancelled) {
            setProcessing(false);
            return;
          }
          throw new Error(result.error ?? "カード決済失敗");
        }
        resetPayment();
        setTapFailed(false); // 通ったら失敗の表示は残さない
        const tapPaymentId = paymentIdOf(result.receipt);
        router.replace(
          tapPaymentId ? `/pos/receipt-standalone/${tapPaymentId}` : "/(tabs)",
        );
        return;
      }

      // QR決済（iPad/Android「カード」 or iPhone「QR」）
      const qrFlow = isQrFlow(device, method);
      if (qrFlow) {
        await startCardEntry(false);
        setProcessing(false);
        return;
      }

      // pos_checkout は呼び出し元を検査しないため端末からは直接呼ばない。
      // テナントと担当者はサーバがトークンから決める
      const pId = paymentIdOf(
        await mobileApi("/pos/checkout", {
          method: "POST",
          body: {
            store_id: selectedStore?.id || null,
            payment_method: method,
            amount: total,
            received_amount: method === "cash" ? received : total,
            items_json: itemsJson,
          },
        }),
      );

      resetPayment();
      router.replace(pId ? `/pos/receipt-standalone/${pId}` : "/(tabs)");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ||
            (err as { details?: string })?.details ||
            JSON.stringify(err) ||
            "決済に失敗しました";
      setSnackbar(msg);
      // タッチ決済が読めなかったときだけ、カード番号入力への導線を出す
      if (isTapToPayFlow(device, method)) setTapFailed(true);
    } finally {
      setProcessing(false);
    }
  }

  const tapAction = tapFailureAction(
    device,
    paymentMethod,
    tapFailed,
    !!cardEntry.url,
    useTerminalStore((st) => st.pendingCapturePaymentIntentId),
  );

  const segments = paymentSegments(device);

  const isProcessing = isTerminalBusy(paymentStatus);

  const isDisabled =
    processing ||
    isProcessing ||
    cardEntry.polling ||
    cart.length === 0 ||
    total <= 0 ||
    (paymentMethod === "cash" && received < total);

  const submitLabel = (() => {
    if (cardEntry.polling) return "お客様の決済完了を待っています...";
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
      <Stack.Screen
        options={{
          title: step === "menu" ? "品目を選ぶ" : "会計",
          // headerLeft は条件付きスプレッドで渡さないこと。setOptions はマージなので
          // 会計ステップで設定した headerLeft がキーとして残り、品目選択に戻った後も
          // 「品目選択へ戻る」ハンドラのままになって押しても何も起きなくなる
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (step === "checkout") {
                  setStep("menu");
                } else if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace("/(tabs)");
                }
              }}
              hitSlop={8}
              style={styles.headerBack}
              accessibilityRole="button"
              accessibilityLabel={step === "checkout" ? "品目選択に戻る" : "戻る"}
            >
              <Icon source="chevron-left" size={28} color={colors.textPrimary} />
            </Pressable>
          ),
        }}
      />

      {step === "menu" ? (
        <View style={styles.container}>
          {/* 検索 + カテゴリタブ（グリッドと分離して常時固定） */}
          <View style={styles.pickerHeader}>
            <MenuFilterBar
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={changeCategory}
              search={menuSearch}
              onSearchChange={setMenuSearch}
            />
          </View>

          {/* 等幅タイルグリッド。FlatList なので品目が増えても描画は画面分だけ */}
          <FlatList
            key={numColumns}
            data={gridData}
            numColumns={numColumns}
            keyExtractor={(item, i) => item?.id ?? `pad-${i}`}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) =>
              item ? (
                <MenuTile
                  name={item.name}
                  price={item.unit_price}
                  badge={cartQty.get(item.id) ?? 0}
                  onPress={() => addMenuItem(item)}
                />
              ) : (
                <MenuTileSpacer />
              )
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {menuItems.length === 0
                  ? "メニューが未登録です"
                  : "該当するメニューがありません"}
              </Text>
            }
          />

          {/* 合計バー */}
          <View
            style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing.md }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.barCount}>{itemCount}点</Text>
              <Text style={styles.barTotal}>¥{total.toLocaleString()}</Text>
            </View>
            {/* カートが空でも進めること。カスタム品目（自由入力）は会計側にあり、
                メニュー未登録の店舗や都度見積りの会計はそこからしか作れない */}
            <LedraButton icon="arrow-right" onPress={() => setStep("checkout")}>
              明細・支払い
            </LedraButton>
          </View>
        </View>
      ) : (
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          {/* QR 提示中は金額を動かせない。Stripe が請求する額と
              pos_checkout に記帳する額がずれる */}
          {!cardEntry.polling && (
            <Pressable
              style={styles.backToMenu}
              onPress={() => setStep("menu")}
              accessibilityRole="button"
            >
              <Text style={styles.backToMenuText}>← 品目を追加する</Text>
            </Pressable>
          )}

          {/* カート明細 */}
          {cart.length > 0 ? (
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
                      disabled={cardEntry.polling}
                      onPress={() => updateQuantity(index, -1)}
                    />
                    <Text style={styles.qtyText}>
                      {item.quantity}
                    </Text>
                    <IconButton
                      icon="plus-circle-outline"
                      size={20}
                      disabled={cardEntry.polling}
                      onPress={() => updateQuantity(index, 1)}
                    />
                    <IconButton
                      icon="delete-outline"
                      size={20}
                      iconColor={colors.danger}
                      disabled={cardEntry.polling}
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
          ) : (
            <View style={styles.card}>
              <Text style={styles.emptyText}>明細がありません</Text>
            </View>
          )}

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
                disabled={cardEntry.polling}
                onPress={addCustomItem}
              />
            </View>
          </View>

          {/* タッチ決済が失敗した後の逃げ道 */}
          {tapAction !== "none" && (
            <View style={styles.tapFailedCard}>
              <Text style={styles.tapFailedTitle}>
                {tapAction === "retry_record" ? "決済は完了しています" : "タッチ決済ができませんでした"}
              </Text>
              <Text style={styles.tapFailedDesc}>
                {tapAction === "retry_record"
                  ? "カードは切れていますが、売上の記録に失敗しました。記録だけやり直してください（二重に請求されることはありません）。"
                  : "カード番号を入力して決済に切り替えられます。"}
              </Text>
              <LedraButton
                style={{ marginTop: spacing.md, alignSelf: "stretch" }}
                disabled={cardEntry.starting || processing}
                onPress={async () => {
                  try {
                    // 記録のやり直しは processCardPayment に任せる。残っている
                    // PaymentIntent の記録だけをやり直し、新しい決済は作らない
                    if (tapAction === "retry_record") await handleCheckout();
                    else await startCardEntry(true);
                  } catch (err) {
                    setSnackbar(err instanceof Error ? err.message : "決済リンクを作れませんでした");
                  }
                }}
              >
                {tapAction === "retry_record" ? "記録をやり直す" : "カード番号で決済する"}
              </LedraButton>
            </View>
          )}

          {/* 決済は済んだが記録に失敗した */}
          {cardEntry.recordError && (
            <View style={styles.tapFailedCard}>
              <Text style={styles.tapFailedTitle}>売上の記録に失敗しました</Text>
              <Text style={styles.tapFailedDesc}>
                決済は完了しています（{cardEntry.recordError}）。記録をやり直してください。
              </Text>
              <LedraButton
                style={{ marginTop: spacing.md, alignSelf: "stretch" }}
                onPress={() => cardEntry.retryRecord()}
              >
                記録をやり直す
              </LedraButton>
            </View>
          )}

          {/* 支払リンクを作れなかった */}
          {cardEntry.startError && (
            <PosNoticeCard
              title="支払リンクを作れませんでした"
              description={`${cardEntry.startError}（現金での会計は続けられます）`}
            />
          )}

          {/* カード番号入力（Stripe Checkout）*/}
          {cardEntry.url && (
            <CardEntryPanel
              url={cardEntry.url}
              amount={total}
              polling={cardEntry.polling}
              mode={cardEntry.fromTapFailure ? "card-entry" : "qr"}
              onCancel={() => cardEntry.cancel()}
              onOpenError={() => setSnackbar("決済ページを開けませんでした。QRを読み取ってください")}
            />
          )}

          {/* ── iPhone: Tap to Pay 専用ボタン（要件 5.1/5.2/5.3/5.5）──
               支払方法リストより上に置くこと自体が要件 5.2。
               disabled を渡していないのは要件 5.3（T&C 未同意でも常時押下可能。
               押下で connect が再走する）。 */}
          {isIPhone && !cardEntry.polling && cart.length > 0 && (
            <View style={styles.tapToPayArea}>
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
                // 実行中の二度押しを止める。押すたびに handleCheckout に再入すると、
                // 最初の discovery を中断するか PaymentIntent を2つ作りうる。
                // 兄弟画面 pos/checkout/[id].tsx:336 と同じ意図。
                // 要件 5.3 が禁じているのは「T&C 未同意でのグレーアウト」なので抵触しない。
                disabled={processing}
                onPress={() => {
                  setPaymentMethod("card");
                  setTapFailed(false);
                  cardEntry.cancel();
                  void handleCheckout("card");
                }}
              />
            </View>
          )}

          {/* 支払方法 */}
          {!cardEntry.polling && cart.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.heading}>
                支払方法
              </Text>
              <SegmentedControl
                segments={segments}
                value={paymentMethod}
                onChange={(v) => {
                  setPaymentMethod(v as PaymentMethod);
                  // 支払方法を変えたら、前の失敗表示と作りかけのリンクは畳む
                  setTapFailed(false);
                  cardEntry.cancel();
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
                    {/* change は Math.max で 0 に丸めてあるので、色は
                        預かり額が足りているかで決める */}
                    <Text
                      style={[
                        styles.totalLabel,
                        {
                          color:
                            received >= total ? colors.success : colors.danger,
                        },
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
          {!cardEntry.polling && cart.length > 0 && (
            <View style={styles.submitArea}>
              <LedraButton
                icon="check-circle"
                // 直接渡さないこと。handleCheckout は methodOverride を取るので、
                // そのまま渡すとタップイベントが第1引数に入る（型で検出済み）。
                onPress={() => void handleCheckout()}
                loading={processing || isProcessing}
                disabled={isDisabled}
              >
                {submitLabel}
              </LedraButton>
            </View>
          )}

          <View style={{ height: spacing["4xl"] }} />
        </ScrollView>
      )}

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
        style={{ backgroundColor: colors.textPrimary }}
        // Android は兄弟同士の重なりを elevation で決める。合計バーが
        // elevation 3 を持つので、既定（0）のままだと通知が完全に隠れる
        wrapperStyle={{ elevation: 8 }}
      >
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  headerBack: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
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
  pickerHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  gridContent: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  gridRow: { gap: spacing.sm },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.bar,
  },
  barCount: {
    ...typography.meta,
    color: colors.textSecondary,
  },
  barTotal: {
    ...typography.titleLarge,
    color: colors.textPrimary,
  },
  backToMenu: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  backToMenuText: {
    ...typography.label,
    color: colors.primary,
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
  tapToPayArea: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
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
