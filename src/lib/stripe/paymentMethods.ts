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
import { OPTIONAL_CAPABILITY_IDS } from "@/lib/stripe/optionalCapabilities";

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
  /** その会計で出せるか（金額制限のある手段がある）。 */
  eligible?: (amountJpy: number) => boolean;
}> = [
  { type: PAYPAY_METHOD, eligible: (amount) => amount >= PAYPAY_MIN_JPY && amount <= PAYPAY_MAX_JPY },
  { type: "alipay" },
  { type: "wechat_pay" },
];
// ここに手段を足したら、レジの案内文のラベル（`PosClient.tsx` の
// `QR_METHOD_LABELS`）にも足すこと。無いと Stripe の画面には出るのに
// 「〜が使えます」に名前が出ない。

// 申請できる決済手段の一覧は、画面とサーバで同じものを見る
export { OPTIONAL_CAPABILITIES, OPTIONAL_CAPABILITY_IDS } from "@/lib/stripe/optionalCapabilities";

const REJECTION_FIELD = {
  payment_method: "payment_method_types",
  capability: "capabilities",
} as const;

type RejectionScope = keyof typeof REJECTION_FIELD;

/** 「全部外して作り直す」を表す番兵。個別に特定できなかったときの逃げ道。 */
const DROP_ALL = "*";

/** `payment_method_types[1]` / `capabilities[paypay_payments]` の括弧の中身。 */
function bracketed(param: string | undefined): string | null {
  return param?.match(/\[([^\]]+)\]/)?.[1] ?? null;
}

/**
 * Stripe の 400 が「この候補のせい」だと言っているか。言っているならその候補名。
 *
 * stripe-node は `.type` に**クラス名**（`StripeInvalidRequestError`）を、
 * `.rawType` に API の型（`invalid_request_error`）を入れる。片方だけ見ると
 * 判定が常に false になり、**フォールバックが丸ごと死ぬ**ので両方見る。
 *
 * 特定は「送った位置」→「名指しの引用」→「本文に1つだけ出る候補」の順で厳しく
 * 見る。**本文に複数の候補が出る場合は特定しない**（「must be one of card,
 * alipay, ...」のような選択肢の列挙を「Alipay が悪い」と読むと、動いている手段を
 * 落としてしまう）。特定できない 400（権限不足など）は `null` を返してそのまま
 * 投げる —— 無関係な失敗を握り潰すと、原因が「なぜか出ない」だけになって追えない。
 *
 * @param indexBase 候補の前に固定で送っている要素数（レジは先頭が `card` なので 1）。
 */
export function rejectedExtra(
  err: unknown,
  candidates: readonly string[],
  scope: RejectionScope,
  indexBase = 0,
): string | null {
  const e = err as { type?: string; rawType?: string; param?: string; message?: string } | null;
  if (e?.rawType !== "invalid_request_error" && e?.type !== "StripeInvalidRequestError") return null;
  if (!candidates.length) return null;

  const param = e.param ?? "";
  const message = e.message ?? "";
  const text = `${param} ${message}`.toLowerCase();

  // 1. 送った位置・キーで名指しされている（もっとも確か）
  const key = bracketed(param);
  if (key !== null) {
    const index = Number(key);
    if (Number.isInteger(index)) return candidates[index - indexBase] ?? DROP_ALL;
    const byKey = candidates.find((c) => c.toLowerCase() === key.toLowerCase());
    if (byKey) return byKey;
  }

  // 2. 本文が値を引用している（"The payment method type provided: paypay is invalid"）
  const quoted = message.match(/provided:?\s*['"`]?([a-z_]+)['"`]?|['"`]([a-z_]+)['"`]/i);
  const quotedName = (quoted?.[1] ?? quoted?.[2])?.toLowerCase();
  const byQuote = candidates.find((c) => c.toLowerCase() === quotedName);
  if (byQuote) return byQuote;

  // 3. 本文に**1つだけ**候補が出る。複数出るなら選択肢の列挙なので特定しない
  const mentioned = candidates.filter((c) => text.includes(c.toLowerCase()));
  if (mentioned.length === 1) return mentioned[0];

  // 4. こちらが足したフィールドを咎めている → 全部外して作り直す
  return text.includes(REJECTION_FIELD[scope]) ? DROP_ALL : null;
}

/** 候補を外した理由。**bulk（特定できずに全部外した）を実績として記録しないこと。** */
export interface DropInfo {
  /** 個別に名指しされたのではなく、まとめて外した。 */
  bulk: boolean;
  /** Stripe のエラー本文（金額制限など、恒久的でない理由の判別に使う）。 */
  message: string;
}

/**
 * 「オプションの候補を付けて実行 → 断られた候補だけ外して再実行」を繰り返す。
 *
 * `maxDrops` は**連続失敗の上限**。`getStripeClient()` の全呼び出しは
 * `withRetry("stripe", ...)` を通っており、非リトライ対象の 400 も共有の
 * circuit breaker の連続失敗に数えられる（5連続で30秒 open → 無関係な Stripe
 * 呼び出しまで巻き添え）。上限に達したら**残りをまとめて外して**最後の1回を投げる。
 */
export async function withOptionalExtras<T>(
  extras: readonly string[],
  run: (extras: string[]) => Promise<T>,
  opts: {
    scope: RejectionScope;
    indexBase?: number;
    maxDrops?: number;
    onDrop?: (name: string, info: DropInfo) => void;
  },
): Promise<{ value: T; extras: string[] }> {
  const maxDrops = opts.maxDrops ?? 2;
  let current = [...extras];
  let failures = 0;

  for (;;) {
    try {
      return { value: await run(current), extras: current };
    } catch (e) {
      const rejected = rejectedExtra(e, current, opts.scope, opts.indexBase);
      if (!rejected) throw e;
      failures++;
      // 上限に達したら残りもまとめて外す。ただし**名指しされた1つ以外は
      // 「断られた」と記録しない** —— Stripe が拒否していない手段まで
      // 使えない扱いにすると、次に選んだ店にも出なくなる
      const dropped = rejected === DROP_ALL || failures >= maxDrops ? current : [rejected];
      const message = e instanceof Error ? e.message : String(e);
      dropped.forEach((name) => opts.onDrop?.(name, { bulk: name !== rejected, message }));
      logger.info("stripe: dropping payment option rejected by Stripe", {
        scope: opts.scope,
        dropped: dropped.join(","),
        error: message,
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
 * Connect アカウントを作る。**加盟店が選んだ決済手段の申請も同時に出す。**
 *
 * `requested` が空なら追加の申請はしない（＝カード決済だけで接続する）。
 * 選ばれた分は Stripe のオンボーディングが必要情報を1回の入力で集めるので、
 * 加盟店の手続きが1回で済む。通らない capability は個別に外して作り直す
 * （接続そのものは絶対に止めない）。
 */
export async function createAccountWithCapabilities(
  stripe: Stripe,
  params: Stripe.AccountCreateParams,
  requested: readonly string[] = [],
): Promise<{ account: Stripe.Account; requested: string[] }> {
  const now = Date.now();
  const selected = requested.filter((c) => OPTIONAL_CAPABILITY_IDS.includes(c));
  const wanted = selected.filter((c) => (capabilityRejectedUntil.get(c) ?? 0) <= now);

  // **加盟店が選んだのに要求しなかった分は黙って捨てない。** 捨てると
  // 「申請したのに Stripe が何も聞いてこない」だけの状態になり、原因が追えない
  const suppressed = selected.filter((c) => !wanted.includes(c));
  if (suppressed.length) {
    logger.warn("stripe connect: skipped capabilities rejected earlier in this process", {
      suppressed: suppressed.join(","),
    });
  }

  const { value, extras } = await withOptionalExtras(
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
      // bulk（どれが悪いか特定できずに外した）を「この capability は無効」と
      // 記録すると、巻き添えで正常な申請まで出さなくなる
      onDrop: (name, info) => {
        if (!info.bulk) capabilityRejectedUntil.set(name, Date.now() + CAPABILITY_RETRY_TTL_MS);
      },
    },
  );
  return { account: value, requested: extras };
}

/** テスト専用 —— プロセス内メモを消す。 */
export function __resetCapabilityMemoForTest(): void {
  capabilityRejectedUntil.clear();
}
