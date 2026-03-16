import { z } from "zod";

const vehicleStatuses = ["draft", "listed", "reserved", "sold", "withdrawn"] as const;

export const marketVehicleCreateSchema = z.object({
  maker: z.string().trim().min(1, "メーカーは必須です。").max(100),
  model: z.string().trim().min(1, "車種は必須です。").max(100),
  status: z.enum(vehicleStatuses).default("draft"),
  grade: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  color_code: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  plate_number: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  chassis_number: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  engine_type: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  displacement: z.number().int().min(0).nullable().optional(),
  transmission: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  drive_type: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  fuel_type: z.string().trim().max(20).nullable().optional().transform(v => v || null),
  door_count: z.number().int().min(0).nullable().optional(),
  seating_capacity: z.number().int().min(0).nullable().optional(),
  body_type: z.string().trim().max(30).nullable().optional().transform(v => v || null),
  inspection_date: z.string().nullable().optional(),
  repair_history: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  condition_grade: z.string().trim().max(10).nullable().optional().transform(v => v || null),
  condition_note: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  asking_price: z.number().min(0).nullable().optional(),
  wholesale_price: z.number().min(0).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional().transform(v => v || null),
  features: z.any().nullable().optional(),
});

export const marketVehicleUpdateSchema = marketVehicleCreateSchema.partial().extend({
  id: z.string().uuid("無効なIDです。"),
});

export const marketVehicleDeleteSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
});

export const inquiryCreateSchema = z.object({
  vehicle_id: z.string().uuid("車両IDは必須です。"),
  buyer_name: z.string().trim().min(1, "お名前は必須です。").max(100),
  buyer_email: z.string().trim().email("有効なメールアドレスを入力してください。"),
  message: z.string().trim().min(1, "メッセージは必須です。").max(2000),
  buyer_company: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  buyer_phone: z.string().trim().max(20).nullable().optional().transform(v => v || null),
});

export const dealCreateSchema = z.object({
  inquiry_id: z.string().uuid("問い合わせIDは必須です。"),
  vehicle_id: z.string().uuid("車両IDは必須です。"),
  buyer_name: z.string().trim().min(1, "お名前は必須です。").max(100),
  buyer_email: z.string().trim().email("有効なメールアドレスを入力してください。"),
  buyer_company: z.string().trim().max(100).nullable().optional().transform(v => v || null),
  agreed_price: z.number().min(0).nullable().optional(),
});
