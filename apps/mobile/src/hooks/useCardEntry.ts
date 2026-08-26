import { useCallback, useRef, useState } from "react";

import { mobileApi } from "@/lib/api";
import { paymentIdOf, type PosCheckoutItem } from "@/lib/pos";
import { recordedMethod, type PaymentMethod } from "@/lib/posPayment";
import { useQrPaymentPoller } from "@/hooks/useQrPaymentPoller";

/**
 * カード番号入力（Stripe Checkout）での会計。**会計画面とウォークインの両方**が使う。
 *
 * なぜフックにまとめたか: 同じ処理を2画面に置くと、**片方だけ直る事故**が起きる。
 * この POS では実際に起きている（Tap to Pay の二重計上）。ここには金額の確定・
 * 記録・重複防止が全部入るので、置き場所は1つにする。
 *
 * ここが守ること:
 *  1. **金額と明細はリンクを作った時点で固定する。** ポーリング中にカートを
 *     編集できてしまうので、決済完了時の値で記録すると Stripe が実際に
 *     請求した額と食い違う。
 *  2. **決済が済んだのに記録に失敗したら、画面を移さない。** 移すと店員は
 *     エラーに気づけず、カードは切られたのに売上が残らない。
 *  3. **同じ会計で2つ目のセッションを作らせない。** 作ると、誰も見ていない
 *     支払リンクが生き残る。
 *  4. **やめる時はセッションを失効させる。** 端末で開いたページがそのまま
 *     残っていると、後から決済できてしまう（有効期限は30分）。
 *  5. **同じ決済で売上を2件立てない。** 記録側へ **Checkout Session の ID** を渡す。
 *     サーバがそれを Stripe から取り直し、支払済みであることと金額を自分で確かめ、
 *     PaymentIntent を鍵にして1件しか作らない（タッチ決済と同じ仕組み）。
 *     PaymentIntent をこちらから送らないのは、`pi_` の文字列なら誰でも作れて、
 *     記録済みの値を混ぜると**売上を消せてしまう**から。
 */
export interface CardEntrySale {
  amount: number;
  items: PosCheckoutItem[];
  method: PaymentMethod;
  reservationId?: string | null;
  storeId?: string | null;
}

export interface CardEntryState {
  url: string | null;
  polling: boolean;
  starting: boolean;
  /** タッチ決済の代わりに始めた会計か。記録は card になる */
  fromTapFailure: boolean;
  /** 決済は済んだが記録に失敗した。画面を移さずに再試行させる */
  recordError: string | null;
  /**
   * 支払リンクを作れなかった。**黙って戻ると「押しても何も起きない」に見える。**
   * 実際、旧サーバは `tenant_id` を必須にしていて新アプリの要求を 400 で弾き、
   * 画面には何も出ないまま会計が進められなくなっていた
   */
  startError: string | null;
}

export function useCardEntry(onRecorded: (paymentId: string | null) => void) {
  const [url, setUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [starting, setStarting] = useState(false);
  const [fromTapFailure, setFromTapFailure] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // リンクを作った時点の会計内容。**これで記録する**（画面の現在値ではない）
  const sale = useRef<CardEntrySale | null>(null);
  // 決済したセッション。**やり直しでも同じ値を送る**（変わると重複防止が効かない）
  const paidSessionId = useRef<string | null>(null);
  // 記録の多重送信を止める。やり直しボタンの二度押しで2件立つのを防ぐ
  const recording = useRef(false);

  const record = useCallback(async () => {
    const s = sale.current;
    if (!s || recording.current) return;
    recording.current = true;
    try {
      const paymentId = paymentIdOf(
        await mobileApi("/pos/checkout", {
          method: "POST",
          body: {
            reservation_id: s.reservationId ?? null,
            store_id: s.storeId || null,
            payment_method: recordedMethod(s.method, fromTapFailure),
            amount: s.amount,
            received_amount: s.amount,
            items_json: s.items,
            checkout_session_id: paidSessionId.current ?? undefined,
          },
        }),
      );
      setRecordError(null);
      sale.current = null;
      paidSessionId.current = null;
      setUrl(null);
      setSessionId(null);
      onRecorded(paymentId);
    } catch (err) {
      // **画面を移さない。** ここで移すと、決済は済んだのに売上が残らないまま
      // 店員が気づけない
      setRecordError(err instanceof Error ? err.message : "決済の記録に失敗しました");
    } finally {
      recording.current = false;
    }
  }, [fromTapFailure, onRecorded]);

  const onPaid = useCallback(async () => {
    setPolling(false);
    paidSessionId.current = sessionId;
    await record();
  }, [record, sessionId]);

  useQrPaymentPoller(polling ? sessionId : null, onPaid);

  const start = useCallback(
    async (next: CardEntrySale, tapFailure: boolean) => {
      // 二度押し・セッションの二重作成を止める
      if (starting || sessionId) return;
      setStarting(true);
      setStartError(null);
      try {
        const res = await mobileApi<{ url: string; session_id: string }>("/pos/checkout/qr-session", {
          method: "POST",
          body: {
            amount: next.amount,
            reservation_id: next.reservationId ?? undefined,
            store_id: next.storeId ?? "",
          },
        });
        sale.current = next;
        paidSessionId.current = null;
        setFromTapFailure(tapFailure);
        setRecordError(null);
        setUrl(res.url);
        setSessionId(res.session_id);
        setPolling(true);
      } catch (err) {
        // ここで握って画面に出す。投げっぱなしにすると未処理の rejection になり、
        // 店員には「ボタンが効かない」としか見えない
        setStartError(err instanceof Error ? err.message : "支払リンクを作れませんでした");
      } finally {
        setStarting(false);
      }
    },
    [starting, sessionId],
  );

  const cancel = useCallback(async () => {
    const id = sessionId;
    setPolling(false);
    setUrl(null);
    setSessionId(null);
    setFromTapFailure(false);
    setRecordError(null);
    sale.current = null;
    paidSessionId.current = null;
    if (!id) return;
    try {
      // 失効させないと、端末で開いたページから後で決済できてしまう
      await mobileApi(`/pos/checkout/qr-session?session_id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // 失効に失敗しても 30 分で切れる。ここで店員を止めない
    }
  }, [sessionId]);

  const state: CardEntryState = { url, polling, starting, fromTapFailure, recordError, startError };
  return { ...state, start, cancel, retryRecord: record };
}
