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

    // ── 冪等: 同じ PaymentIntent が既に記録されていれば作り直さない ──
    const { data: existing } = await admin
      .from("payments")
      .select("id, amount, document_id")
      .eq("tenant_id", caller.tenantId)
      .eq("stripe_payment_intent_id", pi.id)
      .maybeSingle();

    if (existing) {
      // 記録済みの金額が Stripe 側と食い違っていたら、突き合わせのために残す。
      // （通常は起きない。起きたら手で確認する必要がある）
      if (typeof existing.amount === "number" && existing.amount !== pi.amount) {
        logger.error("terminalCapture: 記録済みの金額が Stripe と一致しない", {
          paymentId: existing.id,
          recorded: existing.amount,
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
        result: { payment_id: existing.id, document_id: existing.document_id },
        already_recorded: true,
      };
    }

    const { data, error } = await admin.rpc("pos_checkout", {
      p_tenant_id: caller.tenantId,
      p_reservation_id: input.reservation_id ?? null,
      p_customer_id: input.customer_id ?? null,
      p_store_id: input.store_id ?? null,
      p_register_session_id: input.register_session_id ?? null,
      p_payment_method: "card",
      p_amount: pi.amount,
      p_received_amount: pi.amount,
      p_items_json: input.items_json ?? [],
      p_tax_rate: input.tax_rate,
      p_note: input.note ?? null,
      p_create_receipt: true,
      p_user_id: caller.userId,
    });

    if (error) return { ok: false, kind: "internal", error };

    const paymentId = (data as { payment_id?: string | null } | null)?.payment_id ?? null;

    // PaymentIntent の ID を残す。これが無いと後から突き合わせて重複を見つけられない。
    // 上の一意インデックス（payments_stripe_payment_intent_id_key）と合わせて、
    // 同じ決済で2件目が作られることを DB 側でも防ぐ
    if (paymentId) {
      const { error: linkErr } = await admin
        .from("payments")
        .update({ stripe_payment_intent_id: pi.id })
        .eq("id", paymentId)
        .eq("tenant_id", caller.tenantId);
      if (linkErr) {
        // 23505 = 一意制約違反。上の事前確認と pos_checkout の間に別の要求が
        // 同じ PaymentIntent を記録した、ということ。**支払が2件できている。**
        // 黙って ok を返すと重複が見えなくなるので、失敗として返して気づかせる。
        // ponytail: 上限。事前確認と作成の間の競合は塞げていない（作成は
        // pos_checkout の中なので、PaymentIntent の ID を先に確保できない）。
        // 恒久対応は pos_checkout に引数を足して同一トランザクションで埋めること。
        const duplicate = (linkErr as { code?: string }).code === "23505";
        logger.error("terminalCapture: stripe_payment_intent_id の記録に失敗", {
          paymentId,
          paymentIntentId: pi.id,
          duplicate,
          err: linkErr.message,
        });
        if (duplicate) {
          return {
            ok: false,
            kind: "internal",
            error: new Error(
              `同じ決済が二重に記録されました（payment_id=${paymentId} / payment_intent=${pi.id}）。` +
                "経理で重複を確認してください。",
            ),
          };
        }
      }
    }

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
