import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createPlatformScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { isPlatformAdmin } from "@/lib/auth/platformAdmin";
import { apiJson, apiUnauthorized, apiForbidden, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/platform/report-revenue?status=pending
 * Platform-admin view of the vehicle-report revenue-share payout queue,
 * with each recipient tenant's Stripe Connect onboarding status so the
 * operator can see which shares are actually payable.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!isPlatformAdmin(caller)) return apiForbidden();

    const status = request.nextUrl.searchParams.get("status");
    const admin = createPlatformScopedAdmin("report-revenue — platform-wide payout queue");

    let query = admin
      .from("vehicle_report_revenue_shares")
      .select(
        "id, order_id, tenant_id, vin_code_normalized, cert_count, total_cert_count, " +
          "sale_amount_jpy, share_bps, amount, currency, status, stripe_transfer_id, paid_at, created_at, " +
          "tenants(name, stripe_connect_account_id, stripe_connect_onboarded)",
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return apiInternalError(error, "report-revenue GET");

    return apiJson({ shares: data ?? [] });
  } catch (e) {
    return apiInternalError(e, "report-revenue GET");
  }
}
