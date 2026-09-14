import { NextRequest } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { apiJson, apiUnauthorized, apiForbidden, apiValidationError, apiInternalError } from "@/lib/api/response";

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
    // 請求タイミングは金銭に直結する設定。**テナント設定は owner のみ**（代表判断 2026-09-04）。
    // 以前は settings:edit（admin 以上）だったが、同じ判断で決めた社名・銀行口座と
    // 同じ扱いに揃える。この経路は service-role で書くので RLS は効かず、
    // ここのガードが唯一の境界になる。
    if (!requireMinRole(caller, "owner")) return apiForbidden();

    const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }

    const { admin } = createTenantScopedAdmin(caller.tenantId);
    const now = new Date().toISOString();

    // 戻り値を捨てると、書き込みが失敗しても {ok:true} を返し、画面は「保存しました」と
    // 表示したまま請求タイミングが変わらない（金銭に直結する設定なので握り潰さない）。
    const { error } = await admin
      .from("tenant_billing_settings")
      .upsert(
        { tenant_id: caller.tenantId, billing_timing: parsed.data.billing_timing, updated_at: now },
        { onConflict: "tenant_id" },
      );
    if (error) return apiInternalError(error, "billing-settings PUT");

    return apiJson({ ok: true, billing_timing: parsed.data.billing_timing });
  } catch (e) {
    return apiInternalError(e, "billing-settings PUT");
  }
}
