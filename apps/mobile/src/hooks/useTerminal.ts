import { useCallback, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import {
  useStripeTerminal,
  ErrorCode,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import { mobileApi, ApiError } from "@/lib/api";
import type { PosCheckoutItem } from "@/lib/pos";
import { shouldNotifyDeclinedInBackground } from "@/lib/paymentOutcomeNotify";

/**
 * 決済の記録（サーバ側の pos_checkout）。**カードを切った後に呼ぶ。**
 * 同じ PaymentIntent で2回呼ばれてもサーバ側が2件目を作らない。
 */
function captureOnServer(
  paymentIntentId: string,
  reservationId: string | undefined,
  storeId: string,
  itemsJson: PosCheckoutItem[] | undefined,
) {
  return mobileApi<Record<string, unknown>>("/pos/terminal/capture", {
    method: "POST",
    body: {
      payment_intent_id: paymentIntentId,
      reservation_id: reservationId ?? null,
      store_id: storeId || null,
      items_json: itemsJson ?? [],
    },
  });
}
import { useTerminalStore } from "@/stores/terminalStore";

/**
 * Stripe Terminal のリーダー接続・決済処理を束ねたフック
 *
 * 端末別決済方式：
 *   iPhone  → Tap to Pay (discoverReaders + connectReader 二段階) ※ NFC内蔵
 *   iPad    → 決済不可（確認・管理専用）
 *   Android → Stripe Checkout QR（別フロー・本フック外）
 *   将来    → Bluetooth M2リーダー (discoverReaders + connectReader)
 *
 * Connection token は StripeTerminalProvider 経由で
 * /pos/terminal/connection-token から取得する（root _layout.tsx 参照）。
 */

// SDK は process グローバルなシングルトンで動くため、
// initialize の二重呼び出しを防ぐためのモジュールスコープフラグ。
// useTerminal が複数箇所で同時にマウントされても 1 回だけ初期化する。
let __ttpInitInflight: Promise<void> | null = null;
let __ttpInitialized = false;

/**
 * SDK エラーメッセージから具体的な失敗カテゴリを判別する。
 * 「インストールできません」「Operation not permitted」「Cancelled」など、
 * ユーザーが取れるアクションが異なるためメッセージを分岐する。
 */
function categorizeReaderError(raw: string, code?: string): string {
  const m = (raw ?? "").toLowerCase();
  const c = (code ?? "").toLowerCase();

  // Apple Tap to Pay の OS 側セットアップ (Account/T&C/Region) 失敗
  if (
    m.includes("インストール") ||
    m.includes("install") ||
    m.includes("could not install") ||
    m.includes("setup") ||
    c.includes("readeraccountreference") ||
    c.includes("account") ||
    c.includes("setup")
  ) {
    return (
      "Tap to Pay のセットアップに失敗しました。" +
      "iPhone の Apple ID にサインインし、Apple Pay の地域が日本になっているかをご確認ください。" +
      "（しばらく時間をおいてから再度お試しください）"
    );
  }

  // Entitlement 不足
  if (
    /not permitted|entitlement|application bundle is valid/i.test(raw) ||
    c.includes("entitlement")
  ) {
    return (
      "Tap to Pay の権限 (entitlement) がこのアプリビルドに付与されていません。" +
      "最新のビルドに更新するか、管理者にお問い合わせください。"
    );
  }

  // ユーザーキャンセル
  if (m.includes("cancel") || c === "canceled") {
    return "Tap to Pay がキャンセルされました";
  }

  // 既に discovering / connecting 中
  if (m.includes("already") || m.includes("in progress")) {
    return (
      "前回の Tap to Pay 処理が残っているため再試行できません。" +
      "アプリを一度終了して再起動してください。"
    );
  }

  // OS バージョン
  if (m.includes("os version") || c.includes("osversion")) {
    return "iOS のバージョンが古いため Tap to Pay を利用できません。設定アプリから iOS を最新版に更新してください";
  }

  // それ以外は SDK の生メッセージをそのまま
  return raw || "Tap to Pay 処理に失敗しました";
}

export function useTerminal() {
  const store = useTerminalStore();

  // Tap to Pay 用: discoverReaders 完了 → onUpdateDiscoveredReaders で
  // 受け取った最初のリーダーを Promise で同期化するための ref
  //
  // 型を明示する: setTimeout 戻り型を React Native / Node で揃え、
  // current = null 代入の繰り返しで TS が never に narrow するのを防ぐ。
  type DiscoveryRefShape = {
    resolve: (reader: Reader.Type) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout> | null;
  };
  const tapToPayDiscoveryRef = useRef<DiscoveryRefShape | null>(null);

  const {
    initialize,
    discoverReaders,
    connectReader: sdkConnectReader,
    disconnectReader,
    collectPaymentMethod,
    confirmPaymentIntent,
    cancelCollectPaymentMethod,
    retrievePaymentIntent,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      store.setDiscoveredReaders(readers);
      // Tap to Pay 待機中なら最初のリーダーで Promise を解決
      const ref = tapToPayDiscoveryRef.current;
      if (ref && readers.length > 0) {
        if (ref.timeoutId) clearTimeout(ref.timeoutId);
        tapToPayDiscoveryRef.current = null;
        ref.resolve(readers[0]);
      }
    },
    // Apple Tap to Pay 要件 3.9.1: 設定進捗インジケータ
    // PaymentCardReader.Event.updateProgress 相当
    // SDK は progress を string で渡してくるが store は number | null。
    // 0.00〜1.00 の文字列を float にパースして渡し、NaN は null 扱いにする。
    onDidReportReaderSoftwareUpdateProgress: (progress) => {
      const n = typeof progress === "string" ? parseFloat(progress) : Number(progress);
      store.setConfigurationProgress(Number.isFinite(n) ? n : null);
    },
  });

  // ── 初期化（共通） ────────────────────────────────────────────────
  // SDK 0.0.1-beta.29: initialize() は引数を取らない。
  // connection token は StripeTerminalProvider の tokenProvider prop で渡す。
  // Apple TTP 要件 1.4: osVersionNotSupported は専用にハンドル。
  //
  // モジュールスコープの __ttpInitInflight / __ttpInitialized で
  // 二重初期化を回避する。warmup と settings 画面の同時マウントで
  // initialize() が並走すると SDK が 「Couldn't fetch connection token」
  // 状態になりやすいため。
  const initTerminal = useCallback(async () => {
    if (__ttpInitialized) return;
    if (__ttpInitInflight) {
      await __ttpInitInflight;
      return;
    }
    __ttpInitInflight = (async () => {
      try {
        const result = await initialize();
        if (result.error) {
          const code = (result.error as { code?: string }).code;
          if (
            code === "OS_VERSION_NOT_SUPPORTED" ||
            code === "osVersionNotSupported"
          ) {
            store.setOsVersionSupported(false);
            store.setReaderError(
              "iOS のバージョンが古いため Tap to Pay を利用できません。設定アプリから iOS を最新版に更新してください"
            );
            return;
          }
          store.setReaderError(`初期化失敗: ${result.error.message}`);
          return;
        }
        store.setOsVersionSupported(true);
        __ttpInitialized = true;
      } catch (e) {
        store.setReaderError(`初期化失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
    try {
      await __ttpInitInflight;
    } finally {
      __ttpInitInflight = null;
    }
  }, [initialize]);

  // ── Tap to Pay 接続（iPhone専用） ────────────────────────────────
  // Apple要件: iPhone XS以降 + iOS 18.0.1以上
  // Entitlement: com.apple.developer.proximity-reader.payment.acceptance
  // 新仕様: discoverReaders → onUpdateDiscoveredReaders → connectReader の二段階
  const connectTapToPay = useCallback(async () => {
    store.setReaderStatus("connecting");
    store.setReaderError(null);

    // 前回の試行で残った状態を完全クリア（cyclical failure 対策）。
    //   - 前回の discovery ref / timeout が残っていれば破棄
    //   - 接続済みリーダーがあれば disconnect
    // これをやらないと「1回成功→次失敗→次成功→...」の交互パターンになる。
    if (tapToPayDiscoveryRef.current?.timeoutId) {
      clearTimeout(tapToPayDiscoveryRef.current.timeoutId);
    }
    tapToPayDiscoveryRef.current = null;
    try {
      await disconnectReader();
    } catch {
      // 既に切断済みなら no-op
    }
    store.setConnectedReader(null);
    store.setDiscoveredReaders([]);

    // SDK が未初期化なら先に init
    if (!__ttpInitialized) {
      await initTerminal();
    }

    // location 取得 (失敗時の原因切り分けのため try を分割)
    let locationId: string;
    try {
      const locRes = await mobileApi<{ location_id: string }>(
        "/pos/terminal/location",
        { method: "GET" }
      );
      locationId = locRes.location_id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      store.setReaderStatus("disconnected");
      store.setReaderError(`location 取得失敗: ${msg}`);
      return false;
    }

    try {
      // 1) Tap to Pay リーダーを発見
      // onUpdateDiscoveredReaders が一定時間内に発火しない場合に
      // 永続待ちにならないよう 15s で reject する。
      // timeoutId を ref に保持し、resolve/reject 時に clearTimeout する。
      const readerPromise = new Promise<Reader.Type>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          if (tapToPayDiscoveryRef.current) {
            tapToPayDiscoveryRef.current = null;
            reject(
              new Error(
                "Tap to Pay リーダーが検出されませんでした (15s timeout)。" +
                  "entitlement 未付与 / iOS 16.4 未満 / 端末未対応 / Stripe Terminal 初期化未完了 のいずれかが疑われます"
              )
            );
          }
        }, 15000);
        tapToPayDiscoveryRef.current = { resolve, reject, timeoutId };
      });

      const { error: discoverError } = await discoverReaders({
        discoveryMethod: "tapToPay",
        simulated: false,
      });

      if (discoverError) {
        // discoverReaders が同期的にエラーを返した → ref / timeout を片付ける
        const ref = tapToPayDiscoveryRef.current as DiscoveryRefShape | null;
        if (ref?.timeoutId) clearTimeout(ref.timeoutId);
        tapToPayDiscoveryRef.current = null;
        store.setReaderStatus("disconnected");
        const code = (discoverError as { code?: string }).code;
        store.setReaderError(
          categorizeReaderError(discoverError.message ?? "", code)
        );
        return false;
      }

      const reader = await readerPromise;

      // 2) connectReader にリーダーを渡して接続
      // ここで iOS が Tap to Pay の "インストール" UI を出す。
      // entitlement 付与済みかつ Apple ID/地域 OK なら成功する。
      const { reader: connected, error: connectError } = await sdkConnectReader({
        discoveryMethod: "tapToPay",
        reader,
        locationId,
      });

      if (connectError) {
        store.setReaderStatus("disconnected");
        const code = (connectError as { code?: string }).code;
        store.setReaderError(
          categorizeReaderError(connectError.message ?? "", code)
        );
        return false;
      }

      store.setReaderStatus("connected");
      store.setConnectedReader(connected ?? null);
      // 接続成功 = Apple の T&C 同意 + セットアップ完了。設定画面の
      // 「有効化済み」表示のためにフラグを立てる。
      // ponytail: これは表示用の派生状態でありセッション内のみ。checkout は
      // このフラグでボタンをゲートしない（要件5.3: 未同意でも常時押下可、
      // 押下で connect が再走する）ため、再起動で null に戻っても実害なし。
      store.setTermsAccepted(true);
      return true;
    } catch (e) {
      // タイムアウト / その他例外
      const ref = tapToPayDiscoveryRef.current as DiscoveryRefShape | null;
      if (ref?.timeoutId) clearTimeout(ref.timeoutId);
      tapToPayDiscoveryRef.current = null;
      store.setReaderStatus("disconnected");
      const msg = e instanceof Error ? e.message : String(e);
      store.setReaderError(categorizeReaderError(msg));
      return false;
    }
  }, [discoverReaders, sdkConnectReader, disconnectReader, initTerminal]);

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

      const { reader: connected, error } = await sdkConnectReader({
        discoveryMethod: "bluetoothScan",
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
    [sdkConnectReader]
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
      itemsJson,
    }: {
      amountJpy: number;
      description: string;
      /** 予約と紐付けない walk-in 決済では undefined を許可 */
      reservationId?: string;
      storeId: string;
      /**
       * Stripe の PaymentIntent metadata に載せるだけ。**売上がどのテナントに
       * 書かれるかはこの値では決まらない**（capture 側がトークンから決める）。
       * 書き込み先を制御できると誤解しないこと
       */
      tenantId: string;
      /**
       * 会計明細。capture（= サーバ側の pos_checkout）へそのまま渡す。
       * ここで渡さないと明細も予約紐付けも無い支払だけが残るため、画面側が
       * もう一度 pos_checkout を呼んでいた。結果 **1回の決済で支払が2件**
       * 作られていたので、明細をここへ寄せて画面側の呼び出しを消した。
       */
      itemsJson?: PosCheckoutItem[];
    }) => {
      store.setPaymentStatus("creating");
      store.setPaymentError(null);

      // /code-review (Codex) 指摘: store の pendingCapturePaymentIntentId は、
      // captureOnServer が 401 を返すと mobileApi → handleUnauthorized →
      // signOutEverywhere → resetPayment() の連鎖で**この catch に来る前に**
      // null へ戻される（セッション切れは店舗側にはよくある）。store だけを見て
      // 「非承認」と判定すると、実際は課金済みなのに「完了しませんでした」と
      // 誤通知してしまう。store の外側（この呼び出しのローカル）にも
      // 課金済みの事実を残しておき、store が途中でリセットされても正しく判定する
      let chargedPaymentIntentId: string | null = null;

      try {
        // **カードを切った後で記録に失敗した分**があれば、新しく切り直さずに
        // その PaymentIntent の記録だけをやり直す。ここを飛ばすと毎回新しい
        // PaymentIntent が作られ、客は二重に請求される
        // useCallback の依存に store を入れていないので、閉じ込めた古い値ではなく
        // 現在値を読む（画面側も同じ形で getState() を使っている）
        const pending = useTerminalStore.getState().pendingCapturePaymentIntentId;
        if (pending) {
          chargedPaymentIntentId = pending;
          store.setPaymentStatus("capturing");
          const receipt = await captureOnServer(pending, reservationId, storeId, itemsJson);
          store.setPendingCapture(null);
          store.setPaymentStatus("succeeded");
          store.setLastReceiptData(receipt);
          return { success: true, receipt };
        }

        // 1. バックエンドで PaymentIntent 作成
        const intentData = await mobileApi<{ client_secret: string }>(
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

        // 2. PaymentIntent を取得
        const { paymentIntent, error: retrieveError } =
          await retrievePaymentIntent(intentData.client_secret);
        if (retrieveError || !paymentIntent) {
          throw new Error(retrieveError?.message ?? "PaymentIntent取得失敗");
        }

        store.setPaymentStatus("collecting");

        // 3. カードをかざしてもらう（Tap to Pay / BT リーダー共通）
        const { paymentIntent: collected, error: collectError } =
          await collectPaymentMethod({ paymentIntent });
        if (collectError || !collected) {
          if (collectError?.code === ErrorCode.CANCELED) {
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
          // /code-review (Codex) 指摘: このSDK (beta.31) の confirmPaymentIntent は
          // ネイティブ側がエラーと並べて渡す更新済み PaymentIntent を、JS の
          // ラッパーが確定的に捨てる（node_modules の functions.js:
          // `if (error) return { error, paymentIntent: undefined }`）。
          // StripeError 型に `paymentIntent` フィールドはあるが、この呼び出しの
          // エラーには実際には載らない＝前回の修正（confirmError.paymentIntent
          // を見る）は動かないコードだった。通信エラー等で「確定失敗」と
          // 返っても Stripe 側では charge が成功していることがあるため、
          // サーバー経由（ポーリング用に既にある GET）で実際の状態を確認する
          try {
            const latest = await mobileApi<{ status: string }>(
              `/pos/terminal/create-payment-intent?id=${encodeURIComponent(collected.id)}`
            );
            // /code-review (Codex) 指摘: "succeeded" だけを見ると、まだ
            // 確定していない "processing" 等の非終端状態を「非承認」扱いに
            // してしまう。後で succeeded に変わった場合、二重決済になる。
            // 「非承認で安全に再試行できる」と分かる終端状態のときだけ
            // 非承認として扱い、それ以外（processing 等の未確定含む）は
            // 課金済みかもしれない扱いにする
            if (latest.status !== "requires_payment_method" && latest.status !== "canceled") {
              chargedPaymentIntentId = collected.id;
              store.setPendingCapture(collected.id);
            }
          } catch (statusError) {
            // 「確認できない」を「非承認」と同じ扱いにすると、確認自体が
            // 失敗しただけ（同じ障害で通信が落ちている等）のケースで
            // 「非承認」の誤通知と新規カード入力への誘導を許し、実際には
            // 課金済みなら二重決済になる。「不明」は安全側（既に課金済み
            // かもしれない扱い）に倒す
            chargedPaymentIntentId = collected.id;
            // /code-review (Codex) 指摘: この確認自体が401（トークン切れ）で
            // 失敗した場合、mobileApi 内部で signOutEverywhere→resetPayment()
            // が既に走っている。ここで store.setPendingCapture を呼ぶと、
            // サインアウトで消したはずの store に書き戻してしまい、共有端末で
            // 次にログインした別ユーザーが前のユーザーの決済（違う予約・店舗・
            // 明細）を引き継いで記録しようとしてしまう。401由来のときは store
            // には書かず、この呼び出し内の通知文言判定にだけ反映する
            if (!(statusError instanceof ApiError && statusError.status === 401)) {
              store.setPendingCapture(collected.id);
            }
          }
          throw new Error(confirmError?.message ?? "決済確定失敗");
        }

        store.setPaymentStatus("capturing");

        // **ここから先で失敗しても、カードは既に切られている。**
        // 記録だけをやり直せるように ID を残してから記録しに行く
        chargedPaymentIntentId = confirmed.id;
        store.setPendingCapture(confirmed.id);

        // 5. バックエンドでキャプチャ
        const receipt = await captureOnServer(confirmed.id, reservationId, storeId, itemsJson);

        store.setPendingCapture(null);
        store.setPaymentStatus("succeeded");
        store.setLastReceiptData(receipt);

        return { success: true, receipt };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        store.setPaymentStatus("failed");
        store.setPaymentError(msg);

        // Apple Tap to Pay 要件 5.12: 非承認の結果を見る前にアプリを
        // 閉じていたら通知する。通知失敗は決済結果そのものを妨げない。
        //
        // pendingCapturePaymentIntentId（相当）が残っているなら、カードは既に
        // 切られていて capture（記録）だけが失敗したケース＝非承認ではない。
        // 同じ「完了しませんでした」の文言で送ると、店舗が記録待ちの再試行導線
        // を知らずに決済し直し、二重請求になる。文言を分ける。
        //
        // store の値ではなくこのローカル変数を見る: captureOnServer が 401 を
        // 返すと store は catch に来る前に resetPayment() で null に戻されるため
        // （上のコメント参照）
        const alreadyCharged = chargedPaymentIntentId != null;
        const notification = alreadyCharged
          ? {
              title: "決済の記録に失敗しました",
              body: "カードへの請求は完了している可能性があります。二重に決済せず、アプリを開いて記録をやり直してください。",
            }
          : { title: "決済が完了しませんでした", body: msg };

        // ponytail: Tap to Pay の NFC 読み取りシートが閉じる際、フォアグラウンド
        // のままでも AppState が一瞬 "inactive" を挟むことがある（未検証）。
        // 300ms 待って再確認し、その一瞬だけの遷移を通知の誤送信として拾わない
        // ようにする。300ms は経験則の暫定値。実機で NFC シート dismiss の
        // 遷移時間を計測して調整すること
        if (shouldNotifyDeclinedInBackground(AppState.currentState)) {
          setTimeout(() => {
            if (!shouldNotifyDeclinedInBackground(AppState.currentState)) return;
            void Notifications.scheduleNotificationAsync({
              content: notification,
              trigger: null,
            }).catch(() => {});
          }, 300);
        }

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
    osVersionSupported: store.osVersionSupported,
    configurationProgress: store.configurationProgress,
    termsAccepted: store.termsAccepted,
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
