import { z } from "zod";
import type { DocType } from "./document";

/** 帳票レイアウト設定（pdfDocument で利用） */
export type LayoutConfig = {
  title: {
    prefix: boolean;
    spacing: number;
    align: "center" | "left" | "right";
    fontSize: number;
  };
  logo: {
    show: boolean;
    position: "top-right" | "top-left";
    height: number;
  };
  seal: {
    show: boolean;
    position: "below-issuer" | "over-total";
    size: number;
  };
  issuer: {
    position: "top-right" | "top-left";
    align: "left" | "right";
  };
  recipient: {
    showAddress: boolean;
    showPhone: boolean;
    showPostalCode: boolean;
  };
  items: {
    showUnit: boolean;
    showTaxLabel: boolean;
  };
  colors: {
    primary: string;
    headerRule: string;
  };
  fontSizeBase: number;
};

export const DEFAULT_LAYOUT: LayoutConfig = {
  title: { prefix: true, spacing: 4, align: "center", fontSize: 22 },
  logo: { show: true, position: "top-right", height: 70 },
  seal: { show: true, position: "below-issuer", size: 60 },
  issuer: { position: "top-right", align: "right" },
  recipient: { showAddress: true, showPhone: true, showPostalCode: true },
  items: { showUnit: true, showTaxLabel: true },
  colors: { primary: "#c00", headerRule: "#333" },
  fontSizeBase: 10,
};

const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const layoutConfigSchema = z.object({
  title: z
    .object({
      prefix: z.boolean().default(true),
      spacing: z.number().min(0).max(20).default(4),
      align: z.enum(["center", "left", "right"]).default("center"),
      fontSize: z.number().min(12).max(36).default(22),
    })
    .default({ prefix: true, spacing: 4, align: "center", fontSize: 22 }),
  logo: z
    .object({
      show: z.boolean().default(true),
      position: z.enum(["top-right", "top-left"]).default("top-right"),
      height: z.number().min(20).max(160).default(70),
    })
    .default({ show: true, position: "top-right", height: 70 }),
  seal: z
    .object({
      show: z.boolean().default(true),
      position: z.enum(["below-issuer", "over-total"]).default("below-issuer"),
      size: z.number().min(30).max(140).default(60),
    })
    .default({ show: true, position: "below-issuer", size: 60 }),
  issuer: z
    .object({
      position: z.enum(["top-right", "top-left"]).default("top-right"),
      align: z.enum(["left", "right"]).default("right"),
    })
    .default({ position: "top-right", align: "right" }),
  recipient: z
    .object({
      showAddress: z.boolean().default(true),
      showPhone: z.boolean().default(true),
      showPostalCode: z.boolean().default(true),
    })
    .default({ showAddress: true, showPhone: true, showPostalCode: true }),
  items: z
    .object({
      showUnit: z.boolean().default(true),
      showTaxLabel: z.boolean().default(true),
    })
    .default({ showUnit: true, showTaxLabel: true }),
  colors: z
    .object({
      primary: z.string().regex(HEX_COLOR, "色は #RGB / #RRGGBB 形式で指定してください").default("#c00"),
      headerRule: z.string().regex(HEX_COLOR).default("#333"),
    })
    .default({ primary: "#c00", headerRule: "#333" }),
  fontSizeBase: z.number().min(7).max(14).default(10),
});

export type DocumentTemplate = {
  id: string;
  tenant_id: string;
  name: string;
  doc_type: DocType | null;
  layout_config: LayoutConfig;
  is_default: boolean;
  created_at: string;
  updated_at: string | null;
};

export const templateCreateSchema = z.object({
  name: z.string().trim().min(1, "名称を入力してください").max(80),
  doc_type: z
    .enum([
      "estimate",
      "delivery",
      "purchase_order",
      "order_confirmation",
      "inspection",
      "receipt",
      "invoice",
      "consolidated_invoice",
    ])
    .nullable()
    .optional(),
  layout_config: layoutConfigSchema,
  is_default: z.boolean().default(false),
});

export const templateUpdateSchema = templateCreateSchema.partial().extend({
  id: z.string().uuid(),
});

/** 浅い 2 段マージ。Phase1 で pdfDocument に同名関数があるが、共通化のためこちらを利用。 */
export function mergeLayout(base: LayoutConfig, override?: Partial<LayoutConfig> | null): LayoutConfig {
  if (!override) return base;
  return {
    title: { ...base.title, ...(override.title ?? {}) },
    logo: { ...base.logo, ...(override.logo ?? {}) },
    seal: { ...base.seal, ...(override.seal ?? {}) },
    issuer: { ...base.issuer, ...(override.issuer ?? {}) },
    recipient: { ...base.recipient, ...(override.recipient ?? {}) },
    items: { ...base.items, ...(override.items ?? {}) },
    colors: { ...base.colors, ...(override.colors ?? {}) },
    fontSizeBase: override.fontSizeBase ?? base.fontSizeBase,
  };
}
