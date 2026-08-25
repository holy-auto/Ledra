/**
 * POS の売上を **PaymentIntent 単位で1回だけ** 記録する。
 *
 * **タッチ決済（Terminal）・カード番号入力（Checkout）・Web の QR 決済がここを通る。**
 *
 * なぜ要るか: カードはこの記録より**先に**切れている。記録が失敗して操作者が
 * やり直すと、`pos_checkout` が2度呼ばれて**同じ決済で売上が2件立つ**。
 * Stripe 側の請求は1件なので、経理で突き合わせるまで誰も気づけない。
 *
 * `payments.stripe_payment_intent_id` の部分一意インデックス
 * （`payments_stripe_payment_intent_id_key`、本番適用済み）と合わせて、
 * アプリ側と DB 側の両方で2件目を止める。
 *
 * ponytail: 上限。事前確認と作成の間の競合は塞げていない（作成は pos_checkout の
 * 中なので、PaymentIntent の ID を先に確保できない）。そこに落ちたら一意制約が
 * 効いて **失敗として返る**（黙って ok にはしない）。恒久対応は pos_checkout に
 * 引数を足して同一トランザクションで埋めること。
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

/** `pos_checkout` に渡す引数（tenant_id と user_id は呼び出し側が持つ） */
export interface PosSaleArgs {
  reservation_id?: string | null;
  customer_id?: string | null;
  store_id?: string | null;
  register_session_id?: string | null;
  payment_method: string;
  amount: number;
  received_amount?: number | null;
  items_json?: unknown;
  tax_rate: number;
  note?: string | null;
  create_receipt?: boolean;
}

export type RecordPosSaleResult =
  | {
      ok: true;
      result: unknown;
      paymentId: string | null;
      /** 既に記録済みだった（再送）。カードは二重には切られていない */
      alreadyRecorded: boolean;
      /** 記録済み行の金額。呼び出し側が Stripe の実額と突き合わせる */
      recordedAmount: number | null;
    }
  | { ok: false; error: unknown };

/** `pi_` で始まる文字列だけを冪等キーとして扱う */
function paymentIntentKey(id: string | null | undefined): string | null {
  const v = (id ?? "").trim();
  return v.startsWith("pi_") ? v : null;
}

export async function recordPosSale(
  admin: SupabaseClient,
  caller: { tenantId: string; userId: string },
  args: PosSaleArgs,
  paymentIntentId?: string | null,
): Promise<RecordPosSaleResult> {
  const pi = paymentIntentKey(paymentIntentId);

  // ── 冪等: 同じ PaymentIntent が既に記録されていれば作り直さない ──
  if (pi) {
    // 一意インデックスはテナントを見ない（列1本）。**照合もテナントで絞らない。**
    // 絞ると他テナントに記録済みの PaymentIntent を見落とし、pos_checkout が
    // 走った後で一意制約に当たる（売上と領収書だけが残る）
    const { data: existing, error: lookupErr } = await admin
      .from("payments")
      .select("id, tenant_id, amount, document_id")
      .eq("stripe_payment_intent_id", pi)
      .maybeSingle();

    // **照合できなかったら作らない。** 失敗を「無かった」と読むと、
    // 重複防止のための関数が重複を作る
    if (lookupErr) return { ok: false, error: lookupErr };

    if (existing && existing.tenant_id !== caller.tenantId) {
      return {
        ok: false,
        error: new Error(`この決済は別のテナントに記録済みです（payment_intent=${pi}）。`),
      };
    }

    if (existing) {
      return {
        ok: true,
        result: { payment_id: existing.id, document_id: existing.document_id },
        paymentId: (existing.id as string) ?? null,
        alreadyRecorded: true,
        recordedAmount: typeof existing.amount === "number" ? existing.amount : null,
      };
    }
  }

  const { data, error } = await admin.rpc("pos_checkout", {
    p_tenant_id: caller.tenantId,
    p_reservation_id: args.reservation_id ?? null,
    p_customer_id: args.customer_id ?? null,
    p_store_id: args.store_id ?? null,
    p_register_session_id: args.register_session_id ?? null,
    p_payment_method: args.payment_method,
    p_amount: args.amount,
    p_received_amount: args.received_amount ?? null,
    p_items_json: args.items_json ?? [],
    p_tax_rate: args.tax_rate,
    p_note: args.note ?? null,
    p_create_receipt: args.create_receipt !== false,
    p_user_id: caller.userId,
  });

  if (error) return { ok: false, error };

  const paymentId = (data as { payment_id?: string | null } | null)?.payment_id ?? null;

  // PaymentIntent の ID を残す。これが無いと、後から突き合わせて重複を見つけられない
  if (pi && paymentId) {
    const { error: linkErr } = await admin
      .from("payments")
      .update({ stripe_payment_intent_id: pi })
      .eq("id", paymentId)
      .eq("tenant_id", caller.tenantId);

    if (linkErr) {
      // 23505 = 一意制約違反。事前確認と作成の間に別の要求が同じ PaymentIntent を
      // 記録した、ということ。**支払が2件できている。**
      // 黙って ok を返すと重複が見えなくなるので、失敗として返して気づかせる
      const duplicate = (linkErr as { code?: string }).code === "23505";
      logger.error("recordPosSale: stripe_payment_intent_id の記録に失敗", {
        paymentId,
        paymentIntentId: pi,
        duplicate,
        err: linkErr.message,
      });
      if (duplicate) {
        return {
          ok: false,
          error: new Error(
            `同じ決済が二重に記録されました（payment_id=${paymentId} / payment_intent=${pi}）。` +
              "経理で重複を確認してください。",
          ),
        };
      }
    }

    // 更新が0行に当たっても PostgREST は error=null を返す。**入ったことを確かめる。**
    // 鍵が入っていない売上は、次に同じ決済を記録したときに重複になる
    const { data: keyed } = await admin
      .from("payments")
      .select("stripe_payment_intent_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (keyed?.stripe_payment_intent_id !== pi) {
      // ここで失敗にすると、操作者がやり直して**本当に**重複を作る（鍵が無いので
      // 次回の照合も素通りする）。売上は残したまま、突き合わせのために記録する。
      // ponytail: 上限。鍵の無い行は手で埋める必要がある
      logger.error("recordPosSale: PaymentIntent の鍵が入らなかった（重複防止が効かない）", {
        paymentId,
        paymentIntentId: pi,
      });
    }
  }

  return { ok: true, result: data, paymentId, alreadyRecorded: false, recordedAmount: null };
}
