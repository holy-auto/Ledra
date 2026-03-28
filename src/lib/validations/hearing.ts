import { z } from "zod";

export const hearingCreateSchema = z.object({
  customer_name: z.string().trim().max(100).default(""),
  customer_phone: z.string().trim().max(30).default(""),
  customer_email: z.string().trim().max(200).default(""),
  vehicle_maker: z.string().trim().max(100).default(""),
  vehicle_model: z.string().trim().max(100).default(""),
  vehicle_year: z.union([z.string(), z.number()]).nullable().optional(),
  vehicle_plate: z.string().trim().max(30).default(""),
  vehicle_color: z.string().trim().max(30).default(""),
  vehicle_vin: z.string().trim().max(50).default(""),
  service_type: z.string().trim().max(100).default(""),
  vehicle_size: z.string().trim().max(50).default(""),
  coating_history: z.string().trim().max(500).default(""),
  desired_menu: z.string().trim().max(200).default(""),
  budget_range: z.string().trim().max(100).default(""),
  concern_areas: z.string().trim().max(500).default(""),
  scratches_dents: z.string().trim().max(500).default(""),
  parking_environment: z.string().trim().max(200).default(""),
  usage_frequency: z.string().trim().max(100).default(""),
  additional_requests: z.string().trim().max(1000).default(""),
  hearing_json: z.record(z.string(), z.unknown()).optional().default({}),
});
