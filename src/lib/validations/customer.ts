import { z } from "zod";

/** 空文字 / undefined / null を全て null に寄せたい任意 string フィールド */
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

/** email は空文字 / null のときは許容し、値があるときだけ形式検証する */
const optionalEmail = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
    message: "有効なメールアドレスを入力してください。",
  });

/** 法人番号 (13桁)。空は許容。 */
const optionalCorporateNumber = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^[0-9]{13}$/.test(v), {
    message: "法人番号は13桁の数字で入力してください。",
  });

/** インボイス登録番号 (T+13桁)。空は許容。 */
const optionalInvoiceRegistrationNumber = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^T[0-9]{13}$/.test(v), {
    message: "インボイス登録番号は「T」+13桁の数字で入力してください。",
  });

const optionalHonorific = z
  .enum(["御中", "様", ""])
  .nullable()
  .optional()
  .transform((v) => v || null);

const optionalTransferFeePayer = z
  .enum(["customer", "company"])
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const optionalDocumentDeliveryMethod = z
  .enum(["download", "email"])
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const customerBaseFields = {
  name_kana: optionalTrimmed(100),
  email: optionalEmail,
  phone: optionalTrimmed(20),
  postal_code: optionalTrimmed(10),
  address: optionalTrimmed(200),
  note: optionalTrimmed(1000),
  // 顧客区分 (個人/法人)。既定は個人。
  customer_type: z.enum(["individual", "corporate"]).default("individual"),
  // 法人の支払いサイクル。都度払い / 合算(締め払い)。個人は null。
  billing_cycle: z
    .enum(["per_job", "consolidated"])
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  // 締め日・支払いサイト等の自由記述メモ。
  billing_terms_note: optionalTrimmed(500),
  // 法人番号・インボイス登録番号 (任意, 法人のみ入力想定)。
  corporate_number: optionalCorporateNumber,
  invoice_registration_number: optionalInvoiceRegistrationNumber,
  // 顧客略称名・敬称。
  short_name: optionalTrimmed(100),
  honorific: optionalHonorific,
  // 振込手数料負担・書類送付方法。
  transfer_fee_payer: optionalTransferFeePayer,
  document_delivery_method: optionalDocumentDeliveryMethod,
  // NDA・基本契約書の締結状況。
  nda_status: z.enum(["signed", "unsigned"]).default("unsigned"),
  basic_contract_status: z.enum(["signed", "unsigned"]).default("unsigned"),
};

export const customerCreateSchema = z
  .object({
    name: z.string().trim().min(1, "顧客名は必須です。").max(100),
    ...customerBaseFields,
  })
  // 法人は支払いサイクルの入力を必須にする (合算 or 都度をワークフローが判定に使う)。
  .refine((v) => v.customer_type !== "corporate" || v.billing_cycle !== null, {
    message: "法人顧客は支払いサイクル (都度払い / 合算) を選択してください。",
    path: ["billing_cycle"],
  });

export const customerUpdateSchema = z
  .object({
    id: z.string().uuid("無効なIDです。"),
    name: z.string().trim().min(1, "顧客名は必須です。").max(100),
    ...customerBaseFields,
  })
  .refine((v) => v.customer_type !== "corporate" || v.billing_cycle !== null, {
    message: "法人顧客は支払いサイクル (都度払い / 合算) を選択してください。",
    path: ["billing_cycle"],
  });

export const customerDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});
