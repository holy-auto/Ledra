import { z } from "zod";

const PAYMENT_METHODS = ["cash", "card", "qr", "bank_transfer", "other"] as const;

const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

export const posCheckoutSchema = z
  .object({
    amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
    tax_rate: z.coerce.number().int().min(0, "invalid_tax_rate").max(100, "invalid_tax_rate").default(10),
    payment_method: z.enum(PAYMENT_METHODS, { message: "invalid_payment_method" }).default("cash"),
    received_amount: z.coerce.number().int().min(0).nullable().optional(),
    reservation_id: nullableUuid,
    customer_id: nullableUuid,
    store_id: nullableUuid,
    register_session_id: nullableUuid,
    items_json: z.any().optional(),
    note: nullableText(500),
    create_receipt: z.boolean().optional(),
    // カード番号決済（Stripe Checkout）のセッション。**重複記録の防止に使う。**
    //
    // PaymentIntent を直接受けてはいけない。`pi_` で始まる文字列は誰でも作れるので、
    // 記録済みの値を現金会計に付けて**売上を消す**ことができてしまう。
    // サーバがこのセッションを Stripe から取り直し、支払済みであることと
    // 金額を自分で確かめる（`resolvePaidCheckoutSession`）。
    checkout_session_id: nullableText(200).refine((v) => v === null || v.startsWith("cs_"), {
      message: "invalid_checkout_session",
    }),
    // Square 端末（Terminal API）のチェックアウト。**サーバが Square から
    // 取り直して**支払済みと金額を確かめる（こちらの申告は信じない）
    square_checkout_id: nullableText(200),
    // Square POS アプリで会計した分の引き当て。金額・時刻・店舗で1件に絞れた
    // ときだけ記帳する
    square_reconcile: z.boolean().optional(),
  })
  // 決済の証明は1つの経路にしか属さない。2つ渡されると、記録ルートは片方を
  // 優先するため、もう片方で確認できた本物の決済の payment_id が記録から
  // **まるごと落ちる**。落ちた決済は次の引き当てで「まだ記録されていない」
  // ように見え、別の会計として二重に記帳されうる。このスキーマを共有する
  // 呼び出し元（admin/mobile 両方の POS checkout）全てに一度で効かせるため、
  // ルート個別ではなくここに置く（/code-review 指摘: モバイル側にだけ同じ
  // ガードが無かった）。
  //
  // 当初は checkout_session_id（Stripe）と square_checkout_id/square_reconcile
  // （Square）の組だけを見ていたが、square_checkout_id と square_reconcile を
  // 同時に渡す経路（端末フィールドが古いまま POS アプリ引き当てへ切り替えた
  // 場合等）は素通りしていた。両ルートとも square_checkout_id を優先して
  // square_reconcile を無視するため、古いチェックアウトが already_recorded を
  // 返し、本来意図した POS アプリの決済が未記帳のまま残る（/code-review 指摘）。
  // 3つのフィールドを互いに排他にする。
  .refine(
    (data) =>
      [data.checkout_session_id != null, !!data.square_checkout_id, !!data.square_reconcile].filter(Boolean).length <=
      1,
    {
      message: "checkout_session_id と square_checkout_id と square_reconcile は同時に指定できません",
      path: ["checkout_session_id"],
    },
  );

export const posCheckoutSessionSchema = z.object({
  amount: z.coerce.number().int().min(1).max(999_999_999),
  customer_id: nullableUuid,
  reservation_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  description: z.string().trim().max(500).optional(),
});

export const posQrSessionSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  // 予約からの会計では予約IDが付くが、ウォークイン会計では未指定。
  reservation_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  // 旧ビルドが送ってくるので受けるが、**使わない**。入金先のテナントは
  // サーバがトークンから決める（クライアントの申告で他テナントの
  // Connect アカウントへ入金させない）
  tenant_id: z.string().uuid().optional(),
  store_id: z
    .string()
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const posTerminalCaptureSchema = z.object({
  payment_intent_id: z
    .string()
    .trim()
    .min(1, "invalid_payment_intent_id")
    .max(200)
    .refine((v) => v.startsWith("pi_"), { message: "invalid_payment_intent_id" }),
  reservation_id: nullableUuid,
  customer_id: nullableUuid,
  store_id: nullableUuid,
  register_session_id: nullableUuid,
  items_json: z.any().optional(),
  tax_rate: z.coerce.number().int().min(0).max(100).default(10),
  note: nullableText(500),
});

export const posTerminalPaymentIntentSchema = z.object({
  amount: z.coerce.number().int().min(1, "invalid_amount").max(999_999_999, "invalid_amount"),
  currency: z.string().trim().min(1).max(10).default("jpy"),
  description: z.string().trim().max(500).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const posTerminalProcessSchema = z.object({
  payment_intent_id: z.string().trim().min(1, "payment_intent_id は必須です").max(200),
  reader_id: z.string().trim().min(1, "reader_id は必須です").max(100),
});
