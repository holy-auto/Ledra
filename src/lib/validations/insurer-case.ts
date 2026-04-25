import { z } from "zod";

const CASE_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const CASE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

const optionalUuid = z.string().trim().uuid("無効なIDです。").optional();

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const insurerCaseCreateSchema = z.object({
  title: z.string().trim().min(1, "title is required.").max(200),
  description: optionalText(5000),
  certificate_id: optionalUuid,
  vehicle_id: optionalUuid,
  tenant_id: optionalUuid,
  priority: z.enum(CASE_PRIORITIES).optional(),
  category: optionalText(100),
});

export const insurerCaseUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  category: z.string().trim().max(100).optional(),
  assigned_to: z.string().trim().uuid("無効なIDです。").nullable().optional(),
});

export const insurerCaseMessageSchema = z.object({
  content: z.string().trim().min(1, "content is required.").max(10000),
});

export const insurerCaseBulkSchema = z.object({
  case_ids: z
    .array(z.string().uuid("無効なIDです。"))
    .min(1, "case_ids must be a non-empty array.")
    .max(50, "Maximum 50 cases per bulk operation."),
  status: z.enum(["resolved", "closed"], { message: "status must be 'resolved' or 'closed'." }),
});
