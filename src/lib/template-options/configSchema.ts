import { z } from "zod";
import type { TemplateOptionType } from "@/types/templateOption";

// ---- color validation ----
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "HEXカラーコードを入力してください（例: #1a2b3c）");

// ---- sub-schemas ----

const brandingSchema = z.object({
  logo_asset_id: z.string().uuid().optional(),
  logo_position: z.enum(["top-left", "top-center", "top-right"]).default("top-left"),
  logo_max_height: z.number().int().min(20).max(80).default(40),
  primary_color: hexColor.optional(),
  secondary_color: hexColor.optional(),
  accent_color: hexColor.optional(),
  company_name: z.string().min(1, "社名は必須です").max(100),
  company_address: z.string().max(200).optional(),
  company_phone: z.string().max(20).optional(),
  company_url: z.string().url().max(200).optional().or(z.literal("")),
});

const headerSchema = z.object({
  title: z.string().max(30).default("施工証明書"),
  subtitle: z.string().max(50).optional(),
  show_issue_date: z.boolean().default(true),
  show_certificate_no: z.boolean().default(true),
});

const customSectionSchema = z.object({
  title: z.string().min(1).max(30),
  content: z.string().min(1).max(500),
});

const bodySchema = z.object({
  show_customer_name: z.literal(true).default(true),    // 必須固定
  show_vehicle_info: z.literal(true).default(true),      // 必須固定
  show_service_details: z.literal(true).default(true),   // 必須固定
  show_photos: z.boolean().default(true),
  custom_sections: z.array(customSectionSchema).max(3).default([]),
});

const footerSchema = z.object({
  warranty_text: z.string().max(500).optional(),
  notice_text: z.string().max(500).optional(),
  show_qr: z.boolean().default(true),
  show_cartrust_badge: z.literal(true).default(true),   // 必須固定
  maintenance_url: z.string().url().max(500).optional().or(z.literal("")),
  maintenance_label: z.string().max(50).default("メンテナンス情報"),
  show_maintenance_qr: z.boolean().default(false),
});

const styleSchema = z.object({
  font_family: z.enum(["noto-sans-jp", "noto-serif-jp"]).default("noto-sans-jp"),
  border_style: z.enum(["none", "simple", "double", "elegant"]).default("simple"),
  background_variant: z.enum(["white", "cream", "light-gray"]).default("white"),
});

// ---- full config schema ----

export const templateConfigSchema = z.object({
  version: z.literal(1),
  branding: brandingSchema,
  header: headerSchema.optional(),
  body: bodySchema.optional(),
  footer: footerSchema.optional(),
  style: styleSchema.optional(),
});

export type TemplateConfigInput = z.infer<typeof templateConfigSchema>;

// ---- option type specific validation ----

/**
 * A（preset）契約で許可される変更フィールド
 * - ロゴ・配色・社名・フッター文言・URL・QR
 * - レイアウト・フォント・ヘッダータイトル変更は不可
 */
export function validatePresetConfig(config: TemplateConfigInput): TemplateConfigInput {
  return {
    ...config,
    header: {
      title: "施工証明書", // preset は固定
      show_issue_date: true,
      show_certificate_no: true,
    },
    body: {
      show_customer_name: true,
      show_vehicle_info: true,
      show_service_details: true,
      show_photos: config.body?.show_photos ?? true,
      custom_sections: [], // preset はカスタムセクション不可
    },
    style: {
      font_family: "noto-sans-jp", // preset はフォント固定
      border_style: config.style?.border_style ?? "simple",
      background_variant: config.style?.background_variant ?? "white",
    },
  };
}

/**
 * B（custom）契約で許可される変更フィールド
 * - branding, header, body, footer, style すべて変更可
 * - ただし必須固定項目は維持
 */
export function validateCustomConfig(config: TemplateConfigInput): TemplateConfigInput {
  return {
    ...config,
    body: {
      show_customer_name: true,  // 必須固定
      show_vehicle_info: true,   // 必須固定
      show_service_details: true, // 必須固定
      show_photos: config.body?.show_photos ?? true,
      custom_sections: config.body?.custom_sections ?? [],
    },
    footer: {
      warranty_text: config.footer?.warranty_text,
      notice_text: config.footer?.notice_text,
      show_qr: config.footer?.show_qr ?? true,
      show_cartrust_badge: true, // 必須固定
      maintenance_url: config.footer?.maintenance_url,
      maintenance_label: config.footer?.maintenance_label ?? "メンテナンス情報",
      show_maintenance_qr: config.footer?.show_maintenance_qr ?? false,
    },
  };
}

/** option_type に応じた config 補正 */
export function sanitizeConfig(
  optionType: TemplateOptionType,
  config: TemplateConfigInput,
): TemplateConfigInput {
  if (optionType === "preset") return validatePresetConfig(config);
  return validateCustomConfig(config);
}

// ---- ヒアリングシート ----

export const hearingSchema = z.object({
  shop_name: z.string().min(1, "店舗名は必須です"),
  brand_colors: z.string().optional(),
  warranty_text: z.string().max(1000).optional(),
  notice_text: z.string().max(1000).optional(),
  maintenance_url: z.string().url().optional().or(z.literal("")),
  reference_urls: z.array(z.string().url()).max(3).optional(),
  certificate_items: z.string().max(2000).optional(),
  monthly_issue_count: z.string().optional(),
  additional_requests: z.string().max(2000).optional(),
});

export type HearingInput = z.infer<typeof hearingSchema>;
