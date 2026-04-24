import { z } from "zod";

const textField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

const hearingStatuses = ["draft", "confirmed", "linked", "archived"] as const;

/** DB CHECK に依存する自由入力カラム群。個別制約は DB 側。 */
const hearingFieldsShape = {
  customer_name: textField(100),
  customer_phone: textField(40),
  customer_email: textField(120),
  vehicle_maker: textField(80),
  vehicle_model: textField(80),
  vehicle_year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  vehicle_plate: textField(40),
  vehicle_color: textField(40),
  vehicle_vin: textField(40),
  service_type: textField(40),
  vehicle_size: textField(40),
  coating_history: textField(1000),
  desired_menu: textField(1000),
  budget_range: textField(80),
  concern_areas: textField(500),
  scratches_dents: textField(500),
  parking_environment: textField(200),
  usage_frequency: textField(200),
  additional_requests: textField(1000),
  hearing_json: z.any().nullable().optional(),
};

export const hearingCreateSchema = z.object(hearingFieldsShape);

export const hearingUpdateSchema = z
  .object({
    id: z.string().uuid("無効なIDです。"),
    status: z.enum(hearingStatuses).optional(),
    ...hearingFieldsShape,
  })
  .extend({
    // 顧客連携などの特殊アクション
    action: z.enum(["link_customer"]).optional(),
  });
