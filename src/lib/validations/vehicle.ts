import { z } from "zod";

export const VEHICLE_SIZE_CLASSES = ["SS", "S", "M", "L", "LL", "XL"] as const;
export type VehicleSizeClass = (typeof VEHICLE_SIZE_CLASSES)[number];

export const vehicleCreateSchema = z.object({
  maker: z.string().trim().min(1, "メーカーは必須です。").max(100),
  model: z.string().trim().min(1, "車種は必須です。").max(100),
  year: z.number().int().min(1900).max(2100).nullable().optional(),
  plate_display: z.string().trim().max(30).nullable().optional().transform(v => v || null),
  vin_code: z.string().trim().max(50).nullable().optional().transform(v => v || null),
  notes: z.string().trim().max(500).nullable().optional().transform(v => v || null),
  customer_id: z.string().uuid().nullable().optional(),
  size_class: z.enum(VEHICLE_SIZE_CLASSES).nullable().optional(),
  full_length_mm: z.number().int().min(1).max(99999).nullable().optional(),
  full_width_mm: z.number().int().min(1).max(99999).nullable().optional(),
  full_height_mm: z.number().int().min(1).max(99999).nullable().optional(),
});

export const vehicleUpdateSchema = vehicleCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
