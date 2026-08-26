/**
 * Stripe の決済手段まわりの共有定義。
 *
 * 前提: 日本の決済手段は Stripe 側で**店舗ごとに有効化（審査）**が要る。
 * どれが使えるかは店ごと・時期ごとに変わり、Ledra からは確定できない。
 * そこで方針を1つに統一する ——
 *
 *   **「使える手段は自動で増える。使えない手段があっても既存の機能は落ちない」**
 *
 * 具体的には、要求してみて Stripe に断られた手段だけを外して作り直す
 * （`withOptionalExtras`）。Ledra 側に設定もマイグレーションも持たないので、
 * 店舗の審査が通った瞬間に自動で使えるようになる。
 */
import type Stripe from "stripe";

import { logger } from "@/lib/logger";

/** PayPay の1回あたりの決済上限・下限（Stripe のドキュメント記載値）。 */
export const PAYPAY_MIN_JPY = 50;
export const PAYPAY_MAX_JPY = 1_000_000;

/**
 * ponytail: `paypay` は SDK v20.4.1 (apiVersion 2026-02-25.clover) の型にまだ
 * 無い（public preview のため）。API 側は受ける想定だが型が追いついていないので
 * ここだけキャストする。
 * 上限: SDK が `paypay` を型に入れたらキャストごと削除できる。
 */
type PosPaymentMethod = Stripe.Checkout.SessionCreateParams.PaymentMethodType;
export const PAYPAY_METHOD = "paypay" as PosPaymentMethod;

/**
 * 店頭 QR 会計に出せる「カード以外」の候補。
 *
 * **即時確定する手段だけ**を並べること。コンビニ払い・銀行振込のような
 * 非同期決済を入れると、レジのポーリング（`payment_status === "paid"`）が
 * 永久に完了せず「客は帰ったのに売上が立たない」。
 * （それらは請求書の決済リンク側で出る。あちらは `payment_method_types` を
 * 指定しておらず、店舗が Stripe で有効化すれば自動で候補に入る）
 */
export const OPTIONAL_POS_METHODS: ReadonlyArray<{
  type: PosPaymentMethod;
  label: string;
  /** その会計で出せるか（金額制限のある手段がある）。 */
  eligible?: (amountJpy: number) => boolean;
}> = [
  {
    type: PAYPAY_METHOD,
    label: "PayPay",
    eligible: (amount) => amount >= PAYPAY_MIN_JPY && amount <= PAYPAY_MAX_JPY,
  },
  { type: "alipay", label: "Alipay" },
  { type: "wechat_pay", label: "WeChat Pay" },
];

/**
 * Connect アカウント作成時に一緒に申請する capability。
 *
 * ここに並べた分は Stripe のオンボーディングが**同じ入力フローで**必要情報を
 * 集めるので、加盟店の手続きが1回で済む（後から足すには加盟店自身が Stripe
 * ダッシュボードで申請することになる）。
 *
 * Alipay / WeChat Pay はこの API バージョンに対応する capability が無い
 * （SDK の Capabilities に存在しない）ため、ここには入れられない。
 */
export const REQUESTED_CAPABILITIES = [
  "paypay_payments", // 【要確認】実 API で未検証。拒否されればこれだけ外れる
  "konbini_payments",
  "jp_bank_transfer_payments",
  "link_payments",
] as const;

const REJECTION_FIELD = {
  payment_method: "payment_method_types",
  capability: "capabilities",
} as const;

type RejectionScope = keyof typeof REJECTION_FIELD;

/** 「全部外して作り直す」を表す番兵。個別に特定できなかったときの逃げ道。 */
const DROP_ALL = "*";

/**
 * Stripe の 400 が「この候補のせい」だと言っているか。言っているならその候補名。
 *
 * stripe-node は `.type` に**クラス名**（`StripeInvalidRequestError`）を、
 * `.rawType` に API の型（`invalid_request_error`）を入れる。片方だけ見ると
 * 判定が常に false になり、**フォールバックが丸ごと死ぬ**ので両方見る。
 *
 * 特定できない 400（権限不足など）は `null` を返してそのまま投げる。無関係な
 * 失敗を握り潰すと、原因が「なぜか PayPay が出ない」だけになって追えなくなる。
 */
export function rejectedExtra(err: unknown, candidates: readonly string[], scope: RejectionScope): string | null {
  const e = err as { type?: string; rawType?: string; param?: string; message?: string } | null;
  if (e?.rawType !== "invalid_request_error" && e?.type !== "StripeInvalidRequestError") return null;
  if (!candidates.length) return null;

  const text = `${e.param ?? ""} ${e.message ?? ""}`;
  // 1. エラーが候補名を名指ししている（"The payment method type provided: paypay is invalid"）
  const named = candidates.find((c) => text.toLowerCase().includes(c.toLowerCase()));
  if (named) return named;
  // 2. 名指しは無いが、こちらが足したフィールドを咎めている → 全部外して作り直す
  return text.includes(REJECTION_FIELD[scope]) ? DROP_ALL : null;
}

/**
 * 「オプションの候補を付けて実行 → 断られた候補だけ外して再実行」を繰り返す。
 *
 * 候補は毎回1つ以上減るので、試行回数は `extras.length + 1` を超えない。
 */
export async function withOptionalExtras<T>(
  extras: readonly string[],
  run: (extras: string[]) => Promise<T>,
  opts: { scope: RejectionScope; onDrop?: (name: string) => void },
): Promise<{ value: T; extras: string[] }> {
  let current = [...extras];
  for (;;) {
    try {
      return { value: await run(current), extras: current };
    } catch (e) {
      const rejected = rejectedExtra(e, current, opts.scope);
      if (!rejected) throw e;
      const dropped = rejected === DROP_ALL ? current : [rejected];
      dropped.forEach((name) => opts.onDrop?.(name));
      logger.info("stripe: dropping payment option rejected by Stripe", {
        scope: opts.scope,
        dropped: dropped.join(","),
        error: e instanceof Error ? e.message : String(e),
      });
      current = current.filter((x) => !dropped.includes(x));
    }
  }
}

/**
 * ponytail: 要求できない capability をプロセス内におぼえる。
 *
 * なぜ要るか: 通らない要求は**アカウントを作るたびに 400 を1回出す**。
 * `getStripeClient()` の全呼び出しは `withRetry("stripe", ...)` を通っており、
 * 非リトライ対象の失敗も circuit breaker の連続失敗に数えられる（5連続で30秒
 * open → 直後のフォールバックすら弾かれて接続が 500 になる）。
 * 上限: プロセス単位・TTL 付きの推測。Stripe が対応したら TTL 後にまた要求する。
 */
const CAPABILITY_RETRY_TTL_MS = 60 * 60_000;
const capabilityRejectedUntil = new Map<string, number>();

/**
 * Connect アカウントを作る。**使えそうな決済手段の利用申請も同時に出す。**
 *
 * 後から有効化するには加盟店が自分の Stripe ダッシュボードで別途申請すること
 * になるので、Stripe のオンボーディングが必要情報を**1回の入力で**集めきる形にする。
 * 通らない capability は個別に外して作り直す（接続そのものは絶対に止めない）。
 */
export async function createAccountWithCapabilities(
  stripe: Stripe,
  params: Stripe.AccountCreateParams,
): Promise<Stripe.Account> {
  const now = Date.now();
  const wanted = REQUESTED_CAPABILITIES.filter((c) => (capabilityRejectedUntil.get(c) ?? 0) <= now);

  const { value } = await withOptionalExtras(
    wanted,
    (caps) =>
      stripe.accounts.create(
        caps.length
          ? ({
              ...params,
              capabilities: {
                ...params.capabilities,
                ...Object.fromEntries(caps.map((c) => [c, { requested: true }])),
              },
            } as Stripe.AccountCreateParams)
          : params,
      ),
    {
      scope: "capability",
      onDrop: (name) => capabilityRejectedUntil.set(name, Date.now() + CAPABILITY_RETRY_TTL_MS),
    },
  );
  return value;
}
