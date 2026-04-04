import { NextResponse } from "next/server";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { getAdminClient } from "@/lib/api/auth";
import { apiUnauthorized, apiInternalError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sidebar-badges
 *
 * Returns badge counts for sidebar nav items:
 * - reservations_today: count of today's reservations
 * - square_unlinked: count of square orders without customer_id
 * - expiring_certs_7d: certificates expiring within 7 days
 * - draft_certs: certificates in draft status
 * - overdue_invoices: invoices past due date and not paid
 * - pending_orders: orders with status pending or in_progress
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();

    const admin = getAdminClient();

    // Today's date in JST (UTC+9)
    const now = new Date();
    const jstOffset = 9 * 60 * 60 * 1000;
    const jstDate = new Date(now.getTime() + jstOffset);
    const today = jstDate.toISOString().slice(0, 10);

    // 7 days from now in JST
    const sevenDaysLater = new Date(jstDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysLaterStr = sevenDaysLater.toISOString().slice(0, 10);

    // Count today's reservations (exclude cancelled)
    const reservationsPromise = admin
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .eq("scheduled_date", today)
      .neq("status", "cancelled");

    // Count unlinked square orders (no customer_id)
    const squareUnlinkedPromise = admin
      .from("square_orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", caller.tenantId)
      .is("customer_id", null);

    // Count certificates expiring within 7 days
    const expiringCertsPromise = (async () => {
      try {
        const { count } = await admin
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .gte("expiry_date", today)
          .lte("expiry_date", sevenDaysLaterStr)
          .neq("status", "voided");
        return count ?? 0;
      } catch {
        return 0;
      }
    })();

    // Count draft certificates
    const draftCertsPromise = (async () => {
      try {
        const { count } = await admin
          .from("certificates")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .eq("status", "draft");
        return count ?? 0;
      } catch {
        return 0;
      }
    })();

    // Count overdue invoices (past due_date, not paid)
    const overdueInvoicesPromise = (async () => {
      try {
        const { count } = await admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .eq("doc_type", "invoice")
          .lt("due_date", today)
          .neq("status", "paid");
        return count ?? 0;
      } catch {
        return 0;
      }
    })();

    // Count pending orders (pending or in_progress)
    const pendingOrdersPromise = (async () => {
      try {
        const { count } = await admin
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", caller.tenantId)
          .in("status", ["pending", "in_progress"]);
        return count ?? 0;
      } catch {
        return 0;
      }
    })();

    const [
      reservationsRes,
      squareRes,
      expiringCerts,
      draftCerts,
      overdueInvoices,
      pendingOrders,
    ] = await Promise.all([
      reservationsPromise,
      squareUnlinkedPromise,
      expiringCertsPromise,
      draftCertsPromise,
      overdueInvoicesPromise,
      pendingOrdersPromise,
    ]);

    return NextResponse.json({
      ok: true,
      reservations_today: reservationsRes.count ?? 0,
      square_unlinked: squareRes.count ?? 0,
      expiring_certs_7d: expiringCerts,
      draft_certs: draftCerts,
      overdue_invoices: overdueInvoices,
      pending_orders: pendingOrders,
    }, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    return apiInternalError(e, "sidebar-badges");
  }
}
