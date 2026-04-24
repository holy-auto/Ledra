import { z } from "zod";

export const customerInquiryPatchSchema = z
  .object({
    id: z.string().uuid("無効なIDです。"),
    status: z.enum(["new", "read", "replied"]).optional(),
    admin_reply: z
      .string()
      .trim()
      .max(5000)
      .nullable()
      .optional()
      .transform((v) => (v === null || v === undefined ? undefined : v)),
  })
  .refine((v) => v.status !== undefined || v.admin_reply !== undefined, {
    message: "status または admin_reply のいずれかを指定してください。",
  });
