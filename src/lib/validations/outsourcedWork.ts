import { z } from "zod";
import { OUTSOURCED_WORK_STATES } from "@/lib/domain/states";

/** 外注施工履歴 API の入力。値域の正はドメイン層（states.ts / rules.ts）。 */

const uuid = z.string().uuid();
const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().max(4000);
const paths = z.array(z.string().trim().min(1).max(512)).max(50).default([]);

export const suppliedPartSchema = z.object({
  part_number: shortText,
  part_name: shortText,
  quantity: z.number().positive().max(100000),
  photo_paths: paths,
  label_photo_paths: paths,
});
export type SuppliedPartInput = z.infer<typeof suppliedPartSchema>;

export const createWorkRequestSchema = z.object({
  contractor_tenant_id: uuid,
  client_store_id: uuid.nullable().optional(),
  vehicle_id: uuid.nullable().optional(),
  vin: shortText,
  vehicle_label: shortText.nullable().optional(),
  work_description: z.string().trim().min(1).max(4000),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "作業期限は YYYY-MM-DD")
    .nullable()
    .optional(),
  order_number: shortText.nullable().optional(),
  customer_note: longText.nullable().optional(),
  comment: longText.nullable().optional(),
  designated_reviewer_user_ids: z.array(uuid).max(20).default([]),
  designated_approver_user_ids: z.array(uuid).max(20).default([]),
  parts: z.array(suppliedPartSchema).max(200).default([]),
});
export type CreateWorkRequestInput = z.infer<typeof createWorkRequestSchema>;

/** 受領試行の部品ごとの現物（EVD-003）。 */
export const receiptLineSchema = z.object({
  part_id: uuid,
  received_quantity: z.number().min(0).max(100000),
  actual_part_number: shortText.nullable().optional(),
  appearance: shortText.nullable().optional(),
  packaging: shortText.nullable().optional(),
  photo_paths: paths,
  label_photo_paths: paths,
});

/**
 * 遷移リクエスト。`payload` の中身は遷移先ごとに service.ts が要求するものを見る
 * （施工完了なら署名と使用部品、受領済みなら現物ライン、例外承認なら復帰先）。
 */
export const transitionSchema = z.object({
  to: z.enum(OUTSOURCED_WORK_STATES),
  reason: longText.nullable().optional(),
  /** 例外承認済み（TR-021〜025）・作業保留解除（TR-041〜045）の復帰先。 */
  return_to: z.enum(OUTSOURCED_WORK_STATES).nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const VERIFICATION_RESULTS = ["MATCH", "NEEDS_REVIEW", "MISMATCH"] as const;

/** 遷移を伴わない（または結果次第で遷移する）イベントの登録。 */
export const workEventSchema = z.discriminatedUnion("type", [
  // TERM-004 / AC-005 三方向照合。MATCH のときだけ RECEIVED → MATCHED へ進む
  z.object({
    type: z.literal("VERIFICATION"),
    result: z.enum(VERIFICATION_RESULTS),
    comment: longText.nullable().optional(),
    reason: longText.nullable().optional(),
  }),
  // PER-009 施工担当者割当
  z.object({ type: z.literal("WORKER_ASSIGNED"), user_id: uuid }),
  // TR-049 / EVD-017 完了後の訂正イベント（元記録は上書きしない）
  z.object({
    type: z.literal("CORRECTION"),
    target: shortText,
    reason: longText.min(1),
    before: z.unknown().optional(),
    after: z.unknown().optional(),
  }),
  // TR-050 / AC-021 完了後再施工: 申請 → 承認 → 実施記録
  z.object({ type: z.literal("POST_COMPLETION_REWORK_REQUESTED"), reason: longText.min(1) }),
  z.object({ type: z.literal("POST_COMPLETION_REWORK_APPROVED"), reason: longText.nullable().optional() }),
  z.object({
    type: z.literal("POST_COMPLETION_REWORK_RECORDED"),
    reason: longText.min(1),
    started_at: z.string().datetime().nullable().optional(),
    completed_at: z.string().datetime().nullable().optional(),
    used_parts: z
      .array(z.object({ part_id: uuid.nullable().optional(), part_number: shortText, quantity: z.number().positive() }))
      .default([]),
    before_photo_paths: paths,
    after_photo_paths: paths,
    signature: shortText,
    comment: longText.nullable().optional(),
  }),
]);
export type WorkEventInput = z.infer<typeof workEventSchema>;

/** 施工完了（TR-008 / AC-007）で必須の記録。payload をこれで検証する。 */
export const workCompletedPayloadSchema = z.object({
  used_parts: z
    .array(z.object({ part_id: uuid.nullable().optional(), part_number: shortText, quantity: z.number().positive() }))
    .min(1),
  before_photo_paths: paths,
  after_photo_paths: paths,
  unfinished_work: z.string().trim().max(2000).nullable().optional(),
  comment: longText.nullable().optional(),
  signature: shortText,
});

/** 受領済み（TR-004 / AC-004）で必須の記録。 */
export const receivedPayloadSchema = z.object({
  lines: z.array(receiptLineSchema).min(1),
  comment: longText.nullable().optional(),
});
