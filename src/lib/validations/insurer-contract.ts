import { z } from "zod";

export const insurerContractCreateSchema = z.object({
  insurer_id: z.string().uuid("insurer_id は必須です。"),
  tenant_id: z.string().uuid("tenant_id は必須です。"),
});

export const insurerContractUpdateSchema = z.object({
  id: z.string().uuid("無効なIDです。"),
  status: z.enum(["active", "suspended", "terminated"], {
    message: "status は active, suspended, terminated のいずれかです。",
  }),
});

/** Bulk create contracts for one insurer across multiple tenants. */
export const insurerContractBulkSchema = z.object({
  insurer_id: z.string().uuid("insurer_id は必須です。"),
  tenant_ids: z
    .array(z.string().uuid())
    .min(1, "tenant_ids は1件以上必要です。")
    .max(100, "一度に作成できる契約は100件までです。"),
});
