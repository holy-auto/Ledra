import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

const businessHours = z.any().nullable().optional();

// 緯度・経度。空文字/未指定は null。文字列(number input)も数値に変換し範囲検証する。
const optionalCoord = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    })
    .refine((v) => v === null || (v >= min && v <= max), `${label}が範囲外です`);

const latitude = optionalCoord(-90, 90, "緯度");
const longitude = optionalCoord(-180, 180, "経度");

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1, "店舗名は必須です").max(100),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(120),
  manager_name: optionalText(80),
  business_hours: businessHours,
  latitude,
  longitude,
});

export const storeUpdateSchema = z.object({
  id: z.string().uuid("id is required"),
  name: z.string().trim().min(1).max(100).optional(),
  address: optionalText(300),
  phone: optionalText(40),
  email: optionalText(120),
  manager_name: optionalText(80),
  business_hours: businessHours,
  is_active: z.boolean().optional(),
  latitude,
  longitude,
});

/** 店舗担当者の役割。manager = 店長/責任者、staff = 一般担当。 */
export const storeMemberRoles = ["manager", "staff"] as const;

export const storeMemberAddSchema = z.object({
  user_id: z.string().uuid("user_id is required"),
  role: z.enum(storeMemberRoles).default("staff"),
});

export const storeMemberDeleteSchema = z.object({
  user_id: z.string().uuid("user_id is required"),
});
