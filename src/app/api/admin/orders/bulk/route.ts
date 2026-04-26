import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { enforceBilling } from "@/lib/billing/guard";
import { makePublicId } from "@/lib/publicId";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { orderCreateSchema } from "@/lib/validations/order";

const bulkSchema = z.object({
  orders: z.array(orderCreateSchema).min(1, "orders must be a non-empty array").max(200, "最大200件まで一括インポートできます"),
});

/**
 * POST /api/admin/orders/bulk
 * 複数の発注案件を一括登録する。
 * 各行を個別に検証し、成功/失敗数を返す（部分成功あり）。
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const deny = await enforceBilling(req, {
      minPlan: "free",
      action: "order_create",
      tenantId: caller.tenantId,
    });
    if (deny) return deny;

    const body = await req.json().catch(() => ({}));
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 発注元の請求タイミング設定を一度だけ取得して全行に適用
    const { data: billingSettings } = await admin
      .from("tenant_billing_settings")
      .select("billing_timing")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    const billingTiming = billingSettings?.billing_timing ?? "on_inspection";

    let created = 0;
    const failed: { index: number; title: string; error: string }[] = [];

    for (let i = 0; i < parsed.data.orders.length; i++) {
      const order = parsed.data.orders[i];
      const { to_tenant_id, title, description, category, budget, deadline, vehicle_id, requester_email, requester_company } = order;

      const insertPayload: Record<string, unknown> = {
        public_id: makePublicId(),
        from_tenant_id: caller.tenantId,
        title,
        status: "pending",
        billing_timing: billingTiming,
      };
      if (to_tenant_id) insertPayload.to_tenant_id = to_tenant_id;
      if (description) insertPayload.description = description;
      if (category) insertPayload.category = category;
      if (budget != null && budget !== "") insertPayload.budget = Number(budget);
      if (deadline) insertPayload.deadline = deadline;
      if (vehicle_id) insertPayload.vehicle_id = vehicle_id;
      if (requester_email) insertPayload.requester_email = requester_email;
      if (requester_company) insertPayload.requester_company = requester_company;

      const { error } = await admin.from("job_orders").insert(insertPayload);
      if (error) {
        console.error("[orders/bulk] insert failed", { index: i + 1, title, error: error.message });
        failed.push({ index: i + 1, title, error: error.message });
      } else {
        created++;
      }
    }

    return apiJson({ created, failed }, { status: created > 0 ? 201 : 422 });
  } catch (e: unknown) {
    return apiInternalError(e, "orders/bulk POST");
  }
}
