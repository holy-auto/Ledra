/**
 * Stripe Terminal（Tap to Pay / BT リーダー）の決済確定を POS の売上として記録する。
 *
 * **Web の管理画面とモバイルの両方がここを通る。**
 *
 * なぜ共通化したか: 2つのルートがほぼ同じ処理を持っており、片方だけ直る事故が
 * 起きやすかった（実際、在庫の引き落としは `/pos/checkout` にだけあった）。
 *
 * なぜ冪等にしたか: カードは `confirmPaymentIntent` の時点で既に切れている。
 * その後この記録が失敗すると、**カードは切られているのに売上が残らない**。
 * 操作者は再実行し、新しい PaymentIntent が作られて二重に請求される。
 * 同じ PaymentIntent で2回呼ばれたら、2件目は作らずに1件目を返す。
 */
import type Stripe from "stripe";

import { getStripeClient } from "@/lib/stripe/client";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { deductInventoryForPosItems } from "@/lib/pos/inventoryDeduction";
import { recordPosSale } from "@/lib/pos/recordSale";
import { logger } from "@/lib/logger";

export interface TerminalCaptureInput {
  payment_intent_id: string;
  reservation_id?: string | null;
  customer_id?: string | null;
  store_id?: string | null;
  register_session_id?: string | null;
  items_json?: unknown;
  tax_rate: number;
  note?: string | null;
}

export type TerminalCaptureResult =
  | { ok: false; kind: "validation"; error: string }
  | { ok: false; kind: "internal"; error: unknown }
  | {
      ok: true;
      payment_intent_id: string;
      amount: number;
      status: string;
      result: unknown;
      /** 既に記録済みだった（再送）。カードは二重には切られていない */
      already_recorded: boolean;
      inventory?: unknown;
    };

export async function captureTerminalPayment(
  caller: { tenantId: string; userId: string },
  input: TerminalCaptureInput,
): Promise<TerminalCaptureResult> {
  try {
    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // テナントの Stripe Connect アカウント
    const { data: tenant } = await admin
      .from("tenants")
      .select("stripe_connect_account_id, stripe_connect_onboarded")
      .eq("id", caller.tenantId)
      .single();

    const connectAccountId = tenant?.stripe_connect_account_id as string | null;
    const isOnboarded = tenant?.stripe_connect_onboarded as boolean | null;
    const stripeOptions = connectAccountId && isOnboarded ? { stripeAccount: connectAccountId } : undefined;

    const stripe = getStripeClient();
    const pi: Stripe.PaymentIntent = await stripe.paymentIntents.retrieve(input.payment_intent_id, stripeOptions);

    if (pi.status !== "succeeded") {
      return { ok: false, kind: "validation", error: `payment_not_succeeded: status is "${pi.status}"` };
    }

    // 記録は共有の `recordPosSale()` に任せる。**同じ PaymentIntent なら1件しか作らない。**
    // カード番号入力（Checkout）経路も同じ関数を通るので、片方だけ直る事故が起きない
    const sale = await recordPosSale(
      admin,
      caller,
      {
        reservation_id: input.reservation_id,
        customer_id: input.customer_id,
        store_id: input.store_id,
        register_session_id: input.register_session_id,
        payment_method: "card",
        // 金額は **Stripe 側の実額**を使う（端末から渡された値ではない）
        amount: pi.amount,
        received_amount: pi.amount,
        items_json: input.items_json ?? [],
        tax_rate: input.tax_rate,
        note: input.note,
        create_receipt: true,
      },
      pi.id,
    );

    if (!sale.ok) return { ok: false, kind: "internal", error: sale.error };

    if (sale.alreadyRecorded) {
      // 記録済みの金額が Stripe 側と食い違っていたら、突き合わせのために残す。
      // （通常は起きない。起きたら手で確認する必要がある）
      if (sale.recordedAmount !== null && sale.recordedAmount !== pi.amount) {
        logger.error("terminalCapture: 記録済みの金額が Stripe と一致しない", {
          paymentId: sale.paymentId,
          recorded: sale.recordedAmount,
          stripe: pi.amount,
        });
      }
      // ponytail: 在庫の引き落としはここでは再試行しない。上限は「初回の
      // 引き落としが失敗したまま再送されると、在庫だけ減らないままになる」こと。
      // 現状 POS の明細は在庫と紐付いていない（OPEN_QUESTIONS 参照）ので実害は無い。
      return {
        ok: true,
        payment_intent_id: pi.id,
        amount: pi.amount,
        status: pi.status,
        result: sale.result,
        already_recorded: true,
      };
    }

    const paymentId = sale.paymentId;
    const data = sale.result;

    // 在庫の引き落とし。`/pos/checkout` と同じ扱いにする（従来ここだけ抜けていた）。
    // ここでは元から service-role のクライアントなので、outbox も同じものでよい
    const inventory = await deductInventoryForPosItems(admin, input.items_json, {
      tenantId: caller.tenantId,
      paymentId,
      outboxAdmin: admin,
    });

    return {
      ok: true,
      payment_intent_id: pi.id,
      amount: pi.amount,
      status: pi.status,
      result: data,
      already_recorded: false,
      inventory,
    };
  } catch (e: unknown) {
    return { ok: false, kind: "internal", error: e };
  }
}
