/**
 * Square 経由の店頭 QR コード決済。
 *
 * なぜ Square か: PayPay 以外のコード決済（d払い / 楽天ペイ / au PAY / メルペイ）
 * は Stripe が対応しておらず、Ledra から決済できない。Square は日本で主要7種に
 * 対応し、**申請1回で全ブランド**が使える。
 *
 * 経路は2つ。どちらも「Ledra が起票 → 決済 → Ledra が Square の実績を確かめて
 * 記帳」で、記帳の冪等キーは Square の payment_id（`payments.square_payment_id`）。
 *
 *   1. **端末あり**: Terminal API で `payment_type: "QR_CODE"` のチェックアウトを
 *      作ると、Square Terminal がマルチブランド QR を表示する。Ledra は結果を
 *      ポーリングする。店員の操作は「Ledra で会計 → 端末に出た QR を読んでもらう」だけ。
 *   2. **端末なし**: 店の Square POS アプリで会計してもらい、**その決済を
 *      Ledra が引き当てて**記帳する（`findRecentPayment`）。金額・時刻・場所で
 *      特定するので、店員は Ledra に戻って「取り込む」を押すだけでよい。
 *
 * ponytail: 2 の引き当ては「直近 N 分・同額・同ロケーション」の推定。同額の会計が
 * 短時間に複数あると取り違えうるので、**候補が1件に絞れないときは記帳しない**
 * （曖昧なまま金額を確定させない）。上限を上げるなら Square POS API の
 * コールバックで transaction_id を受け取る形にする。
 */
import { squareFetch } from "@/lib/square/client";

/** Terminal のチェックアウト状態。COMPLETED 以外は売上を立てない。 */
export type TerminalCheckoutStatus = "PENDING" | "IN_PROGRESS" | "CANCEL_REQUESTED" | "CANCELED" | "COMPLETED";

export interface TerminalCheckout {
  id: string;
  status: TerminalCheckoutStatus;
  payment_ids?: string[];
  amount_money?: { amount?: number; currency?: string };
  cancel_reason?: string;
}

export interface SquarePayment {
  id: string;
  status: string;
  amount_money?: { amount?: number; currency?: string };
  created_at?: string;
  source_type?: string;
  wallet_details?: { brand?: string; status?: string };
}

/**
 * マルチブランド QR を端末に出す。
 *
 * `reference_id` に Ledra 側の会計キーを入れておくと、Square の売上一覧からも
 * どの会計か辿れる（取り違えの調査に効く）。
 */
export async function createTerminalQrCheckout(params: {
  accessToken: string;
  deviceId: string;
  amountJpy: number;
  idempotencyKey: string;
  referenceId?: string;
  note?: string;
}): Promise<TerminalCheckout> {
  const res = await squareFetch<{ checkout: TerminalCheckout }>(params.accessToken, "/v2/terminals/checkouts", {
    method: "POST",
    body: {
      idempotency_key: params.idempotencyKey,
      checkout: {
        amount_money: { amount: params.amountJpy, currency: "JPY" },
        // マルチブランド QR（PayPay / d払い / 楽天ペイ / au PAY / メルペイ /
        // WeChat Pay / Alipay+ のうち、その店で有効なもの）
        payment_type: "QR_CODE",
        device_options: { device_id: params.deviceId },
        reference_id: params.referenceId,
        note: params.note,
      },
    },
  });
  return res.checkout;
}

export async function getTerminalCheckout(accessToken: string, checkoutId: string): Promise<TerminalCheckout> {
  const res = await squareFetch<{ checkout: TerminalCheckout }>(
    accessToken,
    `/v2/terminals/checkouts/${encodeURIComponent(checkoutId)}`,
  );
  return res.checkout;
}

export async function cancelTerminalCheckout(accessToken: string, checkoutId: string): Promise<void> {
  await squareFetch(accessToken, `/v2/terminals/checkouts/${encodeURIComponent(checkoutId)}/cancel`, {
    method: "POST",
  });
}

export async function getPayment(accessToken: string, paymentId: string): Promise<SquarePayment> {
  const res = await squareFetch<{ payment: SquarePayment }>(
    accessToken,
    `/v2/payments/${encodeURIComponent(paymentId)}`,
  );
  return res.payment;
}

export type FindPaymentResult = { ok: true; payment: SquarePayment } | { ok: false; reason: "not_found" | "ambiguous" };

/**
 * 「Square POS アプリで会計した分」を引き当てる。
 *
 * 直近 `withinMinutes` 分・同額・完了済みの決済を探す。**候補が1件に絞れない
 * ときは記帳しない** —— 同額の会計が短時間に2件あると取り違えるが、金額が
 * 絡む場面で「たぶんこれ」を通すと、後から誰も気づけない。
 */
export async function findRecentPayment(params: {
  accessToken: string;
  locationId: string;
  amountJpy: number;
  withinMinutes: number;
  now: Date;
  /** 既に Ledra に記録済みの payment_id（引き当ての対象から外す）。 */
  excludeIds?: readonly string[];
}): Promise<FindPaymentResult> {
  const beginTime = new Date(params.now.getTime() - params.withinMinutes * 60_000).toISOString();
  const res = await squareFetch<{ payments?: SquarePayment[] }>(
    params.accessToken,
    `/v2/payments?location_id=${encodeURIComponent(params.locationId)}&begin_time=${encodeURIComponent(beginTime)}&sort_order=DESC&limit=100`,
  );

  const exclude = new Set(params.excludeIds ?? []);
  const candidates = (res.payments ?? []).filter(
    (p) =>
      p.status === "COMPLETED" &&
      // **QR（ウォレット）決済だけを見る。** Square アプリで切った同額のカード・
      // 現金まで候補に入れると、それを引き当てるか「特定できない」になる
      p.source_type === "WALLET" &&
      p.amount_money?.amount === params.amountJpy &&
      (p.amount_money?.currency ?? "JPY") === "JPY" &&
      !exclude.has(p.id),
  );

  if (candidates.length === 0) return { ok: false, reason: "not_found" };
  if (candidates.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, payment: candidates[0] };
}

/**
 * Square の決済がどのブランドで払われたか（`wallet_details.brand`）。
 * Ledra の会計手段はどれも「QR決済」に落ちるが、レジ締めの調査用に控える。
 */
export function paymentBrand(payment: SquarePayment): string | null {
  return payment.wallet_details?.brand ?? payment.source_type ?? null;
}
