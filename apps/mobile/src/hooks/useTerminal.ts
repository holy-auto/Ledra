import { useCallback } from "react";
import {
  useStripeTerminal,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import { mobileApi } from "@/lib/api";
import { useTerminalStore } from "@/stores/terminalStore";

/**
 * Stripe Terminal のリーダー接続・決済処理を束ねたフック
 *
 * 端末別決済方式：
 *   iPhone  → Tap to Pay (connectLocalMobileReader) ※ NFC内蔵
 *   iPad    → 決済不可（確認・管理専用）
 *   Android → Stripe Checkout QR（別フロー・本フック外）
 *   将来    → Bluetooth M2リーダー (connectBluetoothReader)
 */
export function useTerminal() {
  const {
    initialize,
    discoverReaders,
    connectBluetoothReader,
    connectLocalMobileReader,
    disconnectReader,
    createPaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    retrievePaymentIntent,
  } = useStripeTerminal();

  const store = useTerminalStore();

  // ── 初期化（共通） ────────────────────────────────────────────────
  const initTerminal = useCallback(async () => {
    try {
      await initialize({
        fetchTokenProvider: async () => {
          const res = await mobileApi(
            "/pos/terminal/connection-token",
            { method: "GET" }
          );
          return res.secret as string;
        },
      });
    } catch (e) {
      store.setReaderError(`初期化失敗: ${e}`);
    }
  }, [initialize]);

  // ── Tap to Pay 接続（iPhone専用） ────────────────────────────────
  // Apple要件: iPhone XS以降 + iOS 18.0.1以上
  // Entitlement: com.apple.developer.proximity-reader.payment.acceptance
  const connectTapToPay = useCallback(async () => {
    store.setReaderStatus("connecting");
    store.setReaderError(null);

    try {
      // locationId をバックエンドから取得
      const res = await mobileApi("/pos/terminal/location", { method: "GET" });
      const locationId = res.location_id as string;

      const { reader, error } = await connectLocalMobileReader({
        locationId,
      });

      if (error) {
        store.setReaderStatus("disconnected");
        store.setReaderError(`Tap to Pay 接続失敗: ${error.message}`);
        return false;
      }

      store.setReaderStatus("connected");
      store.setConnectedReader(reader ?? null);
      return true;
    } catch (e) {
      store.setReaderStatus("disconnected");
      store.setReaderError(`Tap to Pay 初期化失敗: ${e}`);
      return false;
    }
  }, [connectLocalMobileReader]);

  // ── Bluetooth リーダー検索（将来のオリジナル端末向け） ────────────
  const startDiscovery = useCallback(async () => {
    store.setReaderStatus("discovering");
    store.setDiscoveredReaders([]);
    store.setReaderError(null);

    const { error } = await discoverReaders({
      discoveryMethod: "bluetoothScan",
      simulated: false,
    });

    if (error) {
      store.setReaderStatus("disconnected");
      store.setReaderError(`検索失敗: ${error.message}`);
    }
  }, [discoverReaders]);

  // ── Bluetooth リーダー接続（将来のオリジナル端末向け） ────────────
  const connectReader = useCallback(
    async (reader: Reader.Type, locationId: string) => {
      store.setReaderStatus("connecting");
      store.setReaderError(null);

      const { reader: connected, error } = await connectBluetoothReader({
        reader,
        locationId,
      });

      if (error) {
        store.setReaderStatus("disconnected");
        store.setReaderError(`接続失敗: ${error.message}`);
        return false;
      }

      store.setReaderStatus("connected");
      store.setConnectedReader(connected ?? null);
      return true;
    },
    [connectBluetoothReader]
  );

  // ── リーダーを切断 ────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    await disconnectReader();
    store.setReaderStatus("disconnected");
    store.setConnectedReader(null);
  }, [disconnectReader]);

  // ── カード決済フロー（iPhone Tap to Pay / 将来のBTリーダー共通） ──
  const processCardPayment = useCallback(
    async ({
      amountJpy,
      description,
      reservationId,
      storeId,
      tenantId,
    }: {
      amountJpy: number;
      description: string;
      reservationId: string;
      storeId: string;
      tenantId: string;
    }) => {
      store.setPaymentStatus("creating");
      store.setPaymentError(null);

      try {
        // 1. バックエンドで PaymentIntent 作成
        const intentData = await mobileApi(
          "/pos/terminal/create-payment-intent",
          {
            method: "POST",
            body: {
              amount: amountJpy,
              currency: "jpy",
              description,
              metadata: {
                reservation_id: reservationId,
                store_id: storeId,
                tenant_id: tenantId,
              },
            },
          }
        );

        const clientSecret = intentData.client_secret as string;

        // 2. PaymentIntent を取得
        const { paymentIntent, error: retrieveError } =
          await retrievePaymentIntent(clientSecret);
        if (retrieveError || !paymentIntent) {
          throw new Error(retrieveError?.message ?? "PaymentIntent取得失敗");
        }

        store.setPaymentStatus("collecting");

        // 3. カードをかざしてもらう（Tap to Pay / BT リーダー共通）
        const { paymentIntent: collected, error: collectError } =
          await collectPaymentMethod({ paymentIntent });
        if (collectError || !collected) {
          if (collectError?.code === "Canceled") {
            store.setPaymentStatus("cancelled");
            return { success: false, cancelled: true };
          }
          throw new Error(collectError?.message ?? "カード読み取り失敗");
        }

        store.setPaymentStatus("processing");

        // 4. 決済を確定
        const { paymentIntent: confirmed, error: confirmError } =
          await confirmPaymentIntent({ paymentIntent: collected });
        if (confirmError || !confirmed) {
          throw new Error(confirmError?.message ?? "決済確定失敗");
        }

        store.setPaymentStatus("capturing");

        // 5. バックエンドでキャプチャ
        const receipt = await mobileApi("/pos/terminal/capture", {
          method: "POST",
          body: { payment_intent_id: confirmed.id },
        });

        store.setPaymentStatus("succeeded");
        store.setLastReceiptData(receipt as Record<string, unknown>);

        return { success: true, receipt };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        store.setPaymentStatus("failed");
        store.setPaymentError(msg);
        return { success: false, error: msg };
      }
    },
    [
      retrievePaymentIntent,
      collectPaymentMethod,
      confirmPaymentIntent,
    ]
  );

  // ── キャンセル ────────────────────────────────────────────────────
  const cancelPayment = useCallback(async () => {
    await cancelCollectPaymentMethod();
    store.setPaymentStatus("cancelled");
  }, [cancelCollectPaymentMethod]);

  return {
    // 状態
    readerStatus: store.readerStatus,
    connectedReader: store.connectedReader,
    discoveredReaders: store.discoveredReaders,
    readerError: store.readerError,
    paymentStatus: store.paymentStatus,
    paymentError: store.paymentError,
    lastReceiptData: store.lastReceiptData,
    // アクション（共通）
    initTerminal,
    processCardPayment,
    cancelPayment,
    resetPayment: store.resetPayment,
    disconnect,
    // iPhone専用
    connectTapToPay,
    // 将来のBTリーダー向け
    startDiscovery,
    connectReader,
  };
}
