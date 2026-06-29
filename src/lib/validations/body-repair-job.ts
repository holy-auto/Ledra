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

/**
 * 保険査定ステータス (施工店が受領した結果を記録)。null=未提出。
 *   submitted=提出済(承認待ち) / approved=承認 / partial=一部承認 / rejected=差戻
 */
export const CLAIM_STATUSES = ["submitted", "approved", "partial", "rejected"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  submitted: "提出済",
  approved: "承認",
  partial: "一部承認",
  rejected: "差戻",
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

/**
 * 画像の撮影段階 (ガイドライン4.2(1))。certificate_images.stage と同期。
 *   intake_before … ①入庫後〜作業開始前
 *   in_progress  … ②作業実施中
 *   after        … ③作業実施後
 *   unspecified  … 段階未指定 (証明書一般写真)
 */
export const PHOTO_STAGES = ["intake_before", "in_progress", "after", "unspecified"] as const;
export type PhotoStage = (typeof PHOTO_STAGES)[number];

export const PHOTO_STAGE_LABEL: Record<PhotoStage, string> = {
  intake_before: "入庫後〜作業前",
  in_progress: "作業実施中",
  after: "作業実施後",
  unspecified: "段階未指定",
};

/**
 * 部分更新 (PATCH) の意味論を壊さないため、未送信(undefined)は undefined のまま保持し、
 * 空文字 / null のみ null に正規化する。これを怠ると `{ id, stage }` のような部分更新で
 * 省略フィールドが null 化され、ステージ前進だけで納期・金額・備考が消える。
 */
const normalizeOptional = <T>(v: T | "" | null | undefined): T | null | undefined =>
  v === undefined ? undefined : v === "" || v === null ? null : v;

/** 実在する暦日かを検証する (regex は 2026-02-31 等を弾けないため)。 */
function isRealCalendarDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** 空文字 / null を null に正規化する nullable uuid。未送信は undefined を維持。 */
const optionalUuid = z
  .union([z.string().uuid("ID の形式が不正です。"), z.literal(""), z.null()])
  .optional()
  .transform(normalizeOptional);

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform(normalizeOptional);

/** 日付 (YYYY-MM-DD) or null。空文字→null、未送信→undefined。実在しない暦日は拒否。 */
const optionalDate = z
  .union([
    z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD 形式で指定してください。"),
    z.literal(""),
    z.null(),
  ])
  .optional()
  .transform(normalizeOptional)
  .refine((v) => v == null || isRealCalendarDate(v), { message: "存在しない日付です。" });

/** 保険査定ステータス。未送信→undefined、空文字→null(未提出)、それ以外は enum。 */
const optionalClaimStatus = z
  .union([z.enum(CLAIM_STATUSES), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

/** 見積金額 (0 以上の整数 or null)。円単位、numeric(12,0) に格納。未送信は undefined を維持。 */
const optionalAmount = z
  .union([
    z.coerce.number().int("整数で指定してください。").min(0, "0 以上で指定してください。").max(999_999_999_999),
    z.null(),
  ])
  .optional()
  .transform((v) => (v === undefined ? undefined : v == null ? null : v));

/**
 * 作業の内容・方法 (予定 / 実績) を表す構造 (ガイドライン4.2(2))。
 * planned_work_json / actual_work_json に格納する。全項目任意。
 */
export const workContentSchema = z
  .object({
    repair_type: z.string().trim().max(40),
    panels: z.array(z.string().trim().max(80)).max(60),
    methods: z.string().trim().max(2000),
    parts: z.string().trim().max(2000),
    paint: z.string().trim().max(2000),
  })
  .partial();
export type WorkContent = z.infer<typeof workContentSchema>;

/**
 * 作業内容の任意入力。未送信(undefined)は「変更しない」、null は「クリア({})」。
 * PATCH の部分更新セマンティクスを壊さないため undefined は維持する。
 */
const optionalWorkContent = z
  .union([workContentSchema, z.null()])
  .optional()
  .transform((v) => (v === null ? {} : v));

export const bodyRepairJobCreateSchema = z.object({
  customer_id: optionalUuid,
  vehicle_id: optionalUuid,
  reservation_id: optionalUuid,
  stage: z.enum(BODY_REPAIR_STAGES).default("intake"),
  estimate_amount: optionalAmount,
  due_date: optionalDate,
  insurance_company: optionalText(120),
  claim_number: optionalText(60),
  notes: optionalText(2000),
  assigned_staff_id: optionalUuid,
  // ガイドライン準拠フィールド
  certificate_id: optionalUuid,
  estimate_document_id: optionalUuid,
  invoice_document_id: optionalUuid,
  insurer_case_id: optionalUuid,
  claim_status: optionalClaimStatus,
  claim_approved_amount: optionalAmount,
  claim_decided_at: optionalDate,
  planned_work: optionalWorkContent,
  actual_work: optionalWorkContent,
  deviation_reason: optionalText(2000),
  is_specified_maintenance: z.boolean().optional(),
  actual_amount: optionalAmount,
});

export const bodyRepairJobUpdateSchema = z.object({
  id: z.string().uuid("案件 ID が不正です。"),
  stage: z.enum(BODY_REPAIR_STAGES).optional(),
  estimate_amount: optionalAmount,
  due_date: optionalDate,
  insurance_company: optionalText(120),
  claim_number: optionalText(60),
  notes: optionalText(2000),
  assigned_staff_id: optionalUuid,
  // ガイドライン準拠フィールド
  certificate_id: optionalUuid,
  estimate_document_id: optionalUuid,
  invoice_document_id: optionalUuid,
  insurer_case_id: optionalUuid,
  claim_status: optionalClaimStatus,
  claim_approved_amount: optionalAmount,
  claim_decided_at: optionalDate,
  planned_work: optionalWorkContent,
  actual_work: optionalWorkContent,
  deviation_reason: optionalText(2000),
  is_specified_maintenance: z.boolean().optional(),
  actual_amount: optionalAmount,
});

export type BodyRepairJobCreateInput = z.infer<typeof bodyRepairJobCreateSchema>;
export type BodyRepairJobUpdateInput = z.infer<typeof bodyRepairJobUpdateSchema>;
