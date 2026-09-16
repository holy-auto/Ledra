import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

import { apiOk, apiNotFound, apiInternalError, apiValidationError } from "@/lib/api/response";

import { withCaller } from "@/lib/api/withCaller";
const nullableUuid = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), {
    message: "無効なIDです。",
  });

const squareOrderLinkSchema = z
  .object({
    customer_id: nullableUuid,
    vehicle_id: nullableUuid,
    certificate_id: nullableUuid,
    note: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "更新するフィールドを指定してください。",
  });

export const dynamic = "force-dynamic";

// ─── PUT: Square オーダーを顧客/車両/証明書にリンク ───
export const PUT = withCaller<{ id: string }>(
  async (req, { caller, params }) => {
    try {
      const { id } = params;
      if (!id) return apiValidationError("オーダーIDが必要です。");

      const parsed = squareOrderLinkSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) {
        return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
      }
      const updates: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) updates[k] = v;
      }

      const { admin } = createTenantScopedAdmin(caller.tenantId);

      // オーダーの存在確認（テナントスコープ）
      const { data: existing } = await admin
        .from("square_orders")
        .select("id")
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();

      if (!existing) {
        return apiNotFound("指定されたSquareオーダーが見つかりません。");
      }

      const { data: updated, error: updateErr } = await admin
        .from("square_orders")
        .update(updates)
        .eq("id", id)
        .eq("tenant_id", caller.tenantId)
        .select(
          "id, square_order_id, square_location_id, order_state, total_amount, currency, square_created_at, customer_id, vehicle_id, certificate_id, note",
        )
        .single();

      if (updateErr) {
        console.error("[square order link] update error:", updateErr.message);
        return apiInternalError(updateErr, "square order link PUT");
      }

      return apiOk({ order: updated });
    } catch (e) {
      return apiInternalError(e, "square order link PUT");
    }
  },
  { minRole: "staff", routeName: "square order link PUT" },
);
