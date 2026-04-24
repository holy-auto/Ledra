import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { apiOk, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";
import { hearingSchema } from "@/lib/template-options/configSchema";

const createOrderSchema = z.object({
  order_type: z.enum(["preset_setup", "custom_production", "modification", "additional"]),
  hearing: hearingSchema.optional(),
  notes: z.string().max(2000).optional(),
});

/** GET: オーダー一覧 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const { data: orders, error } = await supabase
      .from("template_orders")
      // Explicit columns only — omits internal Stripe identifiers
      // (stripe_payment_intent_id / stripe_invoice_id), internal process
      // fields (hearing_json / assets_json / assigned_to / notes) and
      // operational counters (revision_count / max_revisions) that the
      // admin orders list UI never consumes.
      .select("id, order_type, status, amount, due_date, completed_at, created_at, updated_at")
      .eq("tenant_id", caller.tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return apiOk({ orders: orders ?? [] });
  } catch (e) {
    return apiInternalError(e, "template-options/orders GET");
  }
}

/** POST: 制作オーダー作成（B: custom_production 用） */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "入力が不正です。");
    }

    const supabase = await createClient();
    const caller = await resolveCallerFull(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { order_type, hearing, notes } = parsed.data;

    // 金額設定
    const amounts: Record<string, number> = {
      preset_setup: 16500,
      custom_production: 88000,
      modification: 5500,
      additional: 33000,
    };

    const maxRevisions: Record<string, number> = {
      preset_setup: 0,
      custom_production: 1,
      modification: 0,
      additional: 1,
    };

    const { data: order, error } = await admin
      .from("template_orders")
      .insert({
        tenant_id: caller.tenantId,
        order_type,
        status: order_type === "custom_production" ? "pending_payment" : "paid",
        hearing_json: hearing ?? null,
        notes: notes ?? null,
        amount: amounts[order_type] ?? 0,
        max_revisions: maxRevisions[order_type] ?? 0,
      })
      .select("id, status")
      .single();

    if (error) throw error;

    // ログ記録
    await admin.from("template_order_logs").insert({
      order_id: order.id,
      action: "status_change",
      to_status: order.status,
      actor: caller.userId,
      message: `オーダーを作成しました（${order_type}）`,
    });

    return apiOk({ order_id: order.id, status: order.status });
  } catch (e) {
    return apiInternalError(e, "template-options/orders POST");
  }
}
