import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiValidationError, apiInternalError } from "@/lib/api/response";

const updateSchema = z.object({
  billing_timing: z.enum(["on_inspection", "monthly"]),
});

/** GET /api/admin/billing-settings — 自テナントの請求設定を取得 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const { data } = await admin
      .from("tenant_billing_settings")
      .select("billing_timing")
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    return apiJson({ billing_timing: data?.billing_timing ?? "on_inspection" });
  } catch (e) {
    return apiInternalError(e, "billing-settings GET");
  }
}

/** PUT /api/admin/billing-settings — 自テナントの請求設定を更新 */
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const now = new Date().toISOString();

    await admin
      .from("tenant_billing_settings")
      .upsert(
        { tenant_id: caller.tenantId, billing_timing: parsed.data.billing_timing, updated_at: now },
        { onConflict: "tenant_id" },
      );

    return apiJson({ ok: true, billing_timing: parsed.data.billing_timing });
  } catch (e) {
    return apiInternalError(e, "billing-settings PUT");
  }
}
