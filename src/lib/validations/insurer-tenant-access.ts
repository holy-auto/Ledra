import { z } from "zod";

const optionalNotes = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional()
  .transform((v) => v || null);

export const insurerTenantAccessGrantSchema = z.object({
  insurer_id: z.string().uuid("insurer_id is required"),
  tenant_id: z.string().uuid("tenant_id is required"),
  notes: optionalNotes,
});

export const insurerTenantAccessPatchSchema = z.object({
  id: z.string().uuid("id is required"),
  action: z.enum(["revoke", "update"]).optional(),
  notes: optionalNotes,
});
