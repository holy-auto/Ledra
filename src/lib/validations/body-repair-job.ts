import { z } from "zod";

/**
 * 鈑金工程管理 (Body Repair Workflow) のバリデーションスキーマ。
 *
 * 修理案件を工程ステージで管理する。DB スキーマは
 * supabase/migrations/20260612000009_body_repair_workflow.sql を参照。
 *
 * 工程ステージ:
 *   intake(受付) → estimate(協定) → bodywork(鈑金) → paint(塗装)
 *   → complete(完成) → delivered(出庫)
 *
 * 各ステージへの遷移タイムスタンプ (bodywork_start_at 等) は route 側で
 * ステージ変更を検知して自動セットするため、ここでは入力しない。
 */

export const BODY_REPAIR_STAGES = ["intake", "estimate", "bodywork", "paint", "complete", "delivered"] as const;
export type BodyRepairStage = (typeof BODY_REPAIR_STAGES)[number];

export const BODY_REPAIR_STAGE_LABEL: Record<BodyRepairStage, string> = {
  intake: "受付",
  estimate: "協定",
  bodywork: "鈑金",
  paint: "塗装",
  complete: "完成",
  delivered: "出庫",
};

/** Kanban 列ヘッダーの配色 (Tailwind class)。stage ごとに固定。 */
export const BODY_REPAIR_STAGE_COLOR: Record<BodyRepairStage, string> = {
  intake: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  estimate: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  bodywork: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  paint: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  complete: "bg-green-500/15 text-green-300 border-green-500/30",
  delivered: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

/** 次工程の対応表。delivered(出庫) は最終なので null。 */
export const BODY_REPAIR_NEXT_STAGE: Record<BodyRepairStage, BodyRepairStage | null> = {
  intake: "estimate",
  estimate: "bodywork",
  bodywork: "paint",
  paint: "complete",
  complete: "delivered",
  delivered: null,
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

/** 見積金額 (0 以上の整数 or null)。円単位、numeric(12,0) に格納。 */
const optionalAmount = z
  .union([
    z.coerce.number().int("整数で指定してください。").min(0, "0 以上で指定してください。").max(999_999_999_999),
    z.null(),
  ])
  .optional()
  .transform((v) => (v == null ? null : v));

export const bodyRepairJobCreateSchema = z.object({
  customer_id: optionalUuid,
  vehicle_id: optionalUuid,
  reservation_id: optionalUuid,
  stage: z.enum(BODY_REPAIR_STAGES).default("intake"),
  estimate_amount: optionalAmount,
  insurance_company: optionalText(120),
  claim_number: optionalText(60),
  notes: optionalText(2000),
  assigned_staff_id: optionalUuid,
});

export const bodyRepairJobUpdateSchema = z.object({
  id: z.string().uuid("案件 ID が不正です。"),
  stage: z.enum(BODY_REPAIR_STAGES).optional(),
  estimate_amount: optionalAmount,
  insurance_company: optionalText(120),
  claim_number: optionalText(60),
  notes: optionalText(2000),
  assigned_staff_id: optionalUuid,
});

export type BodyRepairJobCreateInput = z.infer<typeof bodyRepairJobCreateSchema>;
export type BodyRepairJobUpdateInput = z.infer<typeof bodyRepairJobUpdateSchema>;
