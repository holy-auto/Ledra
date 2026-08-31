/**
 * IMP-027: Payment Policy 評価器。
 *
 * v2.0 §11.3: 証明書発行前に支払い条件が満たされているかを判定。
 * Certificate Gate の `payment_policy_met` 条件で使用（IMP-028）。
 *
 * 3 ポリシー:
 * - consumer:  個人顧客 → PAID / OVERPAID で条件成立
 * - b2b:       法人合算 → 合算払いなら支払い状態に関係なく成立（後日請求）
 *              法人都度 → consumer と同じ（PAID / OVERPAID で成立）
 * - insurance: 保険請求 → insurerApproved = true で成立（Phase 2）
 *
 * ponytail: 純関数。IO なし。
 */

import type { PaymentState } from "@/lib/domain/states";
import type { PaymentPolicy, PaymentPolicyContext, PaymentPolicyResult } from "./types";

/** PAID 扱いの状態（返金を含まない — 返金後は条件を再評価すべき）。 */
const PAID_STATES: ReadonlySet<PaymentState> = new Set(["PAID", "OVERPAID"]);

/**
 * 顧客区分とサイクルから適用ポリシーを決定する。
 */
export function resolvePaymentPolicy(
  ctx: Pick<PaymentPolicyContext, "customerType" | "insurerApproved">,
): PaymentPolicy {
  if (ctx.insurerApproved != null) return "insurance";
  return ctx.customerType === "corporate" ? "b2b" : "consumer";
}

/**
 * Payment Policy を評価し、Certificate Gate の条件結果を返す。
 *
 * v2.0 §11.3 + ADR-0002:
 * - UNKNOWN 状態では条件不成立（盲目リトライ禁止原則）。
 * - CANCELED は条件不成立（支払いが取り消されている）。
 *
 * 例外: b2b の合算払い（billingCycle === "consolidated"）は上記2つを含む
 * paymentState を一切見ずに常時成立とする。この例外の根拠（決済は別途後で
 * まとめて行う）は `orderInvoice.ts`/`cycleInvoice.ts` の job_orders 請求書
 * 生成パスでのみ具体的に確認済みで、一般の corporate 顧客の通常ジョブにも
 * 同じ仕組みが当てはまるかは未検証（支払サイトの設定次第で決済期日が
 * 締め日そのものになるケースもある）。詳細・経緯は OPEN_QUESTIONS.md 参照。
 * この判定は closingDay を見ない点で src/lib/signoff/state.ts の④会計ステップと
 * 一致している（ただし2つのモジュール間で predicate 自体を同期させる取り決めが
 * あるわけではなく、下記コメントで同期を明記しているのは支払いサイクル未設定時の
 * 案内文言のみ）。src/lib/orders/orderInvoice.ts の isConsolidatedBilling() は
 * より厳格（billing_cycle === "consolidated" かつ closing_day != null）で、
 * 「合算払いかどうか」の判定基準が箇所によって食い違っている。
 * CANCELED にこの例外を適用してよいか、そもそも合算払いジョブの paymentState を
 * 何から導出するのかも含め未設計 — OPEN_QUESTIONS.md 参照。
 */
export function evaluatePaymentPolicy(ctx: PaymentPolicyContext): PaymentPolicyResult {
  const policy = resolvePaymentPolicy(ctx);
  const { paymentState, billingCycle } = ctx;

  switch (policy) {
    case "consumer":
      return evaluateConsumer(paymentState);

    case "b2b":
      return evaluateB2B(paymentState, billingCycle);

    case "insurance":
      return evaluateInsurance(ctx);
  }
}

/** UNKNOWN → 不成立（v2.0 §11.3: UNKNOWN の間は再決済させない） */
const UNKNOWN_RESULT = (policy: PaymentPolicy): PaymentPolicyResult => ({
  policy,
  met: false,
  reason: "決済結果が不明です。決済プロバイダの管理画面で状態を確認してください。",
});

function evaluateConsumer(paymentState: PaymentState): PaymentPolicyResult {
  if (paymentState === "UNKNOWN") return UNKNOWN_RESULT("consumer");
  if (PAID_STATES.has(paymentState)) {
    return { policy: "consumer", met: true };
  }
  if (paymentState === "PENDING") {
    return { policy: "consumer", met: false, reason: "決済処理中です。完了後に再度確認してください。" };
  }
  return { policy: "consumer", met: false, reason: "お会計が完了していません。" };
}

function evaluateB2B(paymentState: PaymentState, billingCycle: string | null): PaymentPolicyResult {
  // 合算払い → 支払い条件は自動成立（後日まとめて請求）
  // UNKNOWN でも成立: 合算払いは「証明書を今出す、請求は後」なので決済状態は無関係
  if (billingCycle === "consolidated") {
    return { policy: "b2b", met: true };
  }

  if (paymentState === "UNKNOWN") return UNKNOWN_RESULT("b2b");

  // 支払いサイクル未設定 → 設定を促す
  // 注意: この文言は src/lib/signoff/state.ts の④会計ステップと同一。
  // 文言を変えるときは両方揃えること(片方だけ変わると案内が食い違う)。
  if (!billingCycle) {
    return {
      policy: "b2b",
      met: false,
      reason: "この法人顧客の支払いサイクルが未設定です。顧客管理で設定してください。",
    };
  }

  // 都度払い → consumer と同じ
  if (PAID_STATES.has(paymentState)) {
    return { policy: "b2b", met: true };
  }
  if (paymentState === "PENDING") {
    return { policy: "b2b", met: false, reason: "決済処理中です。完了後に再度確認してください。" };
  }
  return { policy: "b2b", met: false, reason: "都度払い契約です。お会計が完了していません。" };
}

function evaluateInsurance(ctx: PaymentPolicyContext): PaymentPolicyResult {
  // ponytail: Phase 2。insurerApproved フラグで簡易判定。
  // UNKNOWN/CANCELED は保険承認の有無に関係なく不成立(このファイル先頭の JSDoc の
  // 「UNKNOWN 状態では条件不成立」「CANCELED は条件不成立」は insurance にも適用される。
  // 承認後に決済が UNKNOWN/取消になるケース＝盲目リトライ禁止原則の対象)。
  if (ctx.paymentState === "UNKNOWN") return UNKNOWN_RESULT("insurance");
  if (ctx.paymentState === "CANCELED") {
    return { policy: "insurance", met: false, reason: "決済が取り消されています。" };
  }
  if (ctx.insurerApproved) {
    return { policy: "insurance", met: true };
  }
  return {
    policy: "insurance",
    met: false,
    reason: "保険会社の承認が未完了です。",
  };
}

/**
 * PaymentState が「盲目リトライ禁止」対象か。
 *
 * v2.0 §11.3: UNKNOWN 状態で新たな決済を発火してはならない。
 * UI は決済ボタンを無効化し、管理者にプロバイダ確認を促す。
 */
export function isBlindRetryBlocked(paymentState: PaymentState): boolean {
  return paymentState === "UNKNOWN";
}
