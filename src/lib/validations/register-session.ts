import { z } from "zod";

const optionalNote = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional()
  .transform((v) => v || null);

export const registerSessionCreateSchema = z.object({
  register_id: z.string().uuid("register_idは必須です"),
  opening_cash: z.coerce.number().int().min(0).default(0),
  note: optionalNote,
});

export const registerSessionUpdateSchema = z.object({
  id: z.string().uuid("idは必須です"),
  note: optionalNote,
  total_sales: z.coerce.number().int().min(0).optional(),
  total_transactions: z.coerce.number().int().min(0).optional(),
  expected_cash: z.coerce.number().int().min(0).optional(),
  closing_cash: z.coerce.number().int().min(0).optional(),
});

export const registerSessionDeleteSchema = z.object({
  id: z.string().uuid("idは必須です"),
});
