import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole, requireMinRole } from "@/lib/auth/checkRole";
import { apiUnauthorized, apiForbidden, apiInternalError, apiNotFound } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/customers/[id]/summary
 *
 * Returns a comprehensive customer summary including stats.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: customerId } = await params;
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    if (!requireMinRole(caller, "staff")) return apiForbidden();

    // Fetch customer
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("name, email, phone, created_at")
      .eq("id", customerId)
      .eq("tenant_id", caller.tenantId)
      .maybeSingle();

    if (custErr) {
      return apiInternalError(custErr, "customer-summary");
    }
    if (!customer) {
      return apiNotFound("顧客が見つかりません。");
    }

    // Fetch stats in parallel
    const [
      { count: totalCertificates },
      { count: activeCertificates },
      { count: totalVehicles },
      { data: invoiceData },
      { data: lastCertRow },
    ] = await Promise.all([
      // Total certificates
      supabase
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId),
      // Active certificates
      supabase
        .from("certificates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .eq("status", "active"),
      // Total vehicles
      supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId),
      // Invoices: count and sum
      supabase
        .from("documents")
        .select("id, total_amount")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .in("doc_type", ["invoice", "consolidated_invoice"]),
      // Last visit (most recent certificate)
      supabase
        .from("certificates")
        .select("created_at")
        .eq("tenant_id", caller.tenantId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const invoices = invoiceData ?? [];
    const totalSpent = invoices.reduce(
      (sum, inv) => sum + (typeof inv.total_amount === "number" ? inv.total_amount : 0),
      0,
    );

    return NextResponse.json({
      customer,
      stats: {
        total_certificates: totalCertificates ?? 0,
        active_certificates: activeCertificates ?? 0,
        total_vehicles: totalVehicles ?? 0,
        total_invoices: invoices.length,
        total_spent: totalSpent,
        last_visit: lastCertRow?.[0]?.created_at ?? null,
      },
    });
  } catch (e) {
    return apiInternalError(e, "customer-summary");
  }
}
