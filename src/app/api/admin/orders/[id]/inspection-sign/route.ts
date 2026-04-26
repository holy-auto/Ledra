import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiNotFound, apiValidationError, apiForbidden, apiInternalError } from "@/lib/api/response";

const schema = z.object({
  signature_data_url: z
    .string()
    .min(1)
    .refine((v) => v.startsWith("data:image/png;base64,"), {
      message: "signature_data_url は PNG data URL である必要があります",
    }),
  signer_name: z.string().trim().max(100).optional(),
});

/**
 * POST /api/admin/orders/[id]/inspection-sign
 * 発注側（from_tenant）が手書きサインで検収承認し、ステータスを payment_pending に遷移させる
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { signature_data_url, signer_name } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    const { data: order, error: fetchErr } = await admin
      .from("job_orders")
      .select("id, status, from_tenant_id, inspection_signed_at, billing_timing")
      .eq("id", id)
      .single();

    if (fetchErr || !order) return apiNotFound("order_not_found");

    // 発注側のみ操作可能
    if (order.from_tenant_id !== caller.tenantId) {
      return apiForbidden("発注者のみが検収サインを行えます");
    }

    // approval_pending のみ遷移可
    if (order.status !== "approval_pending") {
      return apiValidationError("検収サインは「検収待ち」ステータスの注文のみ可能です");
    }

    // 既にサイン済み
    if (order.inspection_signed_at) {
      return apiValidationError("既に検収サイン済みです");
    }

    const now = new Date().toISOString();

    const { data, error } = await admin
      .from("job_orders")
      .update({
        status: "payment_pending",
        client_approved_at: now,
        inspection_signature_data_url: signature_data_url,
        inspection_signed_at: now,
        inspection_signer_name: signer_name || null,
        updated_at: now,
      })
      .eq("id", id)
      .eq("status", "approval_pending")
      .select("id, status, client_approved_at, inspection_signed_at, inspection_signer_name")
      .maybeSingle();

    if (error) return apiInternalError(error, "inspection-sign update");
    if (!data) return apiNotFound("order_not_found_or_conflict");

    // 監査ログ
    admin
      .from("order_audit_log")
      .insert({
        job_order_id: id,
        actor_user_id: caller.userId,
        actor_tenant_id: caller.tenantId,
        action: "status_changed",
        old_value: { status: "approval_pending" },
        new_value: { status: "payment_pending", inspection_signed: true },
      })
      .then(() => {}, console.error);

    // 請求書メール自動送付（都度払いのみ。末締めは月末cronで処理）
    if (!order.billing_timing || order.billing_timing === "on_inspection") {
      const { sendOrderInvoiceEmail } = await import("@/lib/orders/orderInvoice");
      sendOrderInvoiceEmail(id).catch((e: unknown) =>
        console.error("[inspection-sign] invoice email failed:", e),
      );
    }

    return apiJson({ ok: true, order: data });
  } catch (e: unknown) {
    return apiInternalError(e, "inspection-sign POST");
  }
}
