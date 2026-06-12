import { NextRequest } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import {
  apiJson,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiInternalError,
} from "@/lib/api/response";
import { couponIssueSchema } from "@/lib/validations/coupon";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/admin/coupons/[id]/issue
 *
 * 顧客にクーポンを発行する (coupon_issues に 1 行追加)。
 *  - coupons.used_count は発行時ではなく「使用時」に +1 する (use route)。
 *  - expires_days を指定すると発行時刻 + N 日を expires_at にセット。
 *  - customer_id を指定する場合は自テナント所属を検証 (client 供給 ID を信頼しない)。
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return apiNotFound("coupon id required");

    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    const parsed = couponIssueSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return apiValidationError(parsed.error.issues[0]?.message ?? "invalid payload");
    }
    const { customer_id, expires_days, issue_channel } = parsed.data;

    const { admin } = createTenantScopedAdmin(caller.tenantId);

    // 1) クーポンを取得し、有効性を検証 (テナントスコープ)。
    const { data: coupon, error: fetchErr } = await admin
      .from("coupons")
      .select("id, is_active, max_uses, used_count, valid_until")
      .eq("id", id)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();
    if (fetchErr) return apiInternalError(fetchErr, "coupons issue fetch");
    if (!coupon) return apiNotFound("対象のクーポンが見つかりません。");
    if (!coupon.is_active) return apiValidationError("停止中のクーポンは発行できません。");
    if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) {
      return apiValidationError("このクーポンは利用上限に達しています。");
    }

    // 2) customer_id が指定されていれば自テナント所属を検証。
    if (customer_id) {
      const { data: cust, error: custErr } = await admin
        .from("customers")
        .select("id")
        .eq("id", customer_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
      if (custErr) return apiInternalError(custErr, "coupons issue customer check");
      if (!cust) return apiValidationError("指定された顧客が見つかりません。");
    }

    // 3) expires_at を算出 (expires_days 指定時のみ)。クーポンの valid_until が
    //    より早ければそちらを優先 (発行 expiry が施策期限を超えないように)。
    let expiresAt: string | null = null;
    if (expires_days != null) {
      const d = new Date();
      d.setDate(d.getDate() + expires_days);
      expiresAt = d.toISOString();
    }
    if (coupon.valid_until) {
      const validUntilIso = new Date(`${coupon.valid_until}T23:59:59`).toISOString();
      if (expiresAt == null || validUntilIso < expiresAt) {
        expiresAt = validUntilIso;
      }
    }

    const { data: issue, error: insertErr } = await admin
      .from("coupon_issues")
      .insert({
        coupon_id: id,
        tenant_id: caller.tenantId,
        customer_id: customer_id,
        expires_at: expiresAt,
        status: "issued",
        issue_channel: issue_channel,
      })
      .select("id, coupon_id, customer_id, issued_at, expires_at, status, issue_channel")
      .single();
    if (insertErr) return apiInternalError(insertErr, "coupon_issues insert");

    return apiJson({ ok: true, issue }, { status: 201 });
  } catch (e) {
    return apiInternalError(e, "coupons issue POST");
  }
}
