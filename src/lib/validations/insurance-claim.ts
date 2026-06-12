import { z } from "zod";

/**
 * 損保協定・アジャスター連携 (Insurance Claim Coordination) の
 * バリデーションスキーマ。
 *
 * DB スキーマは supabase/migrations/20260612000021_insurance_claims.sql を参照。
 *
 * 協定ステータス:
 *   pending(申請前) → adjuster_scheduled(訪問予定) → adjuster_visited(訪問済)
 *   → agreed(協定成立) / rejected(否認) → paid(支払済)
 */

export const INSURANCE_CLAIM_STATUSES = [
  "pending",
  "adjuster_scheduled",
  "adjuster_visited",
  "agreed",
  "rejected",
  "paid",
] as const;
export type InsuranceClaimStatus = (typeof INSURANCE_CLAIM_STATUSES)[number];

export const INSURANCE_CLAIM_STATUS_LABEL: Record<InsuranceClaimStatus, string> = {
  pending: "申請前",
  adjuster_scheduled: "訪問予定",
  adjuster_visited: "訪問済",
  agreed: "協定成立",
  rejected: "否認",
  paid: "支払済",
};

/** ステータスバッジの配色 (Tailwind class)。status ごとに固定。 */
export const INSURANCE_CLAIM_STATUS_COLOR: Record<InsuranceClaimStatus, string> = {
  pending: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  adjuster_scheduled: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  adjuster_visited: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  agreed: "bg-green-500/15 text-green-300 border-green-500/30",
  rejected: "bg-red-500/15 text-red-300 border-red-500/30",
  paid: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

/** 空文字 / undefined を null に正規化する nullable uuid */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v ? v : null));

/** YYYY-MM-DD 形式の日付 (空文字 / null は null に正規化)。 */
const optionalDate = z
  .union([
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください。"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform((v) => (v ? v : null));

/** 金額: 正の整数 (円単位、numeric(12,0) に格納)。空 / null は null。 */
const optionalPositiveAmount = z
  .union([
    z.coerce
      .number()
      .int("整数で指定してください。")
      .positive("0 より大きい値で指定してください。")
      .max(999_999_999_999),
    z.null(),
  ])
  .optional()
  .transform((v) => (v == null ? null : v));

/** 金額: 0 以上の整数 (免責 / 顧客負担用)。空 / null は null。 */
const optionalNonNegativeAmount = z
  .union([
    z.coerce.number().int("整数で指定してください。").min(0, "0 以上で指定してください。").max(999_999_999_999),
    z.null(),
  ])
  .optional()
  .transform((v) => (v == null ? null : v));

export const insuranceClaimCreateSchema = z.object({
  body_repair_job_id: optionalUuid,
  reservation_id: optionalUuid,
  insurance_company: z.string().trim().min(1, "保険会社を入力してください。").max(120),
  claim_number: optionalText(60),
  adjuster_name: optionalText(80),
  adjuster_phone: optionalText(30),
  status: z.enum(INSURANCE_CLAIM_STATUSES).default("pending"),
  adjuster_visit_date: optionalDate,
  agreed_amount: optionalPositiveAmount,
  deductible_amount: optionalNonNegativeAmount,
  customer_burden: optionalNonNegativeAmount,
  submitted_at: optionalDate,
  agreed_at: optionalDate,
  paid_at: optionalDate,
  notes: optionalText(2000),
});

export const insuranceClaimUpdateSchema = z.object({
  id: z.string().uuid("協定 ID が不正です。"),
  body_repair_job_id: optionalUuid,
  reservation_id: optionalUuid,
  insurance_company: z.union([z.string().trim().min(1).max(120), z.undefined()]).optional(),
  claim_number: optionalText(60),
  adjuster_name: optionalText(80),
  adjuster_phone: optionalText(30),
  status: z.enum(INSURANCE_CLAIM_STATUSES).optional(),
  adjuster_visit_date: optionalDate,
  agreed_amount: optionalPositiveAmount,
  deductible_amount: optionalNonNegativeAmount,
  customer_burden: optionalNonNegativeAmount,
  submitted_at: optionalDate,
  agreed_at: optionalDate,
  paid_at: optionalDate,
  notes: optionalText(2000),
});

export type InsuranceClaimCreateInput = z.infer<typeof insuranceClaimCreateSchema>;
export type InsuranceClaimUpdateInput = z.infer<typeof insuranceClaimUpdateSchema>;
