import { z } from "zod";

export const certificateCreateSchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(["active", "draft"]).default("active"),
  customer_name: z.string().trim().min(1, "顧客名は必須です。"),
  customer_phone_last4: z
    .string()
    .regex(/^\d{4}$/, "電話番号下4桁は数字4桁で入力してください。")
    .nullable()
    .optional(),
  vehicle_info_json: z.any().nullable().optional(),
  content_free_text: z.string().nullable().optional(),
  content_preset_json: z.any().nullable().optional(),
  expiry_type: z.string().nullable().optional(),
  expiry_value: z.string().nullable().optional(),
  logo_asset_path: z.string().nullable().optional(),
  footer_variant: z.string().nullable().optional(),
});

export const certificateVoidSchema = z.object({
  public_id: z.string().trim().min(10, "公開IDは10文字以上です。").max(100),
});

export const certificateEditSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  customer_name: z.string().trim().min(1).max(200).optional(),
  customer_phone_last4: z
    .string()
    .regex(/^\d{4}$/, "電話番号下4桁は数字4桁で入力してください。")
    .nullable()
    .optional(),
  vehicle_info_json: z.any().nullable().optional(),
  content_free_text: z.string().nullable().optional(),
  content_preset_json: z.any().nullable().optional(),
  expiry_type: z.string().nullable().optional(),
  expiry_value: z.string().nullable().optional(),
  logo_asset_path: z.string().nullable().optional(),
  footer_variant: z.string().nullable().optional(),
  status: z.enum(["active", "draft", "void"]).optional(),
});
