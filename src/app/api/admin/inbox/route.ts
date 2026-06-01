import { createClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { apiJson, apiUnauthorized, apiInternalError } from "@/lib/api/response";
import { buildApprovalInbox } from "@/lib/admin/approvalInbox";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/inbox
 * 承認インボックス: 当テナントで人の承認を待つドラフト（証明書 / 発注 / 請求）を
 * 集約して返す。RLS + 明示の tenant_id で当テナントに限定。
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const caller = await resolveCallerWithRole(supabase);
    if (!caller) return apiUnauthorized();
    const tenantId = caller.tenantId;

    const [certs, pos, invs] = await Promise.all([
      supabase
        .from("certificates")
        .select("public_id, customer_name, service_type")
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("purchase_orders")
        .select("id, po_number, subtotal, suppliers(name)")
        .eq("tenant_id", tenantId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("documents")
        .select("id, doc_number, recipient_name, total")
        .eq("tenant_id", tenantId)
        .eq("doc_type", "invoice")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (certs.error) return apiInternalError(certs.error, "inbox certificates");
    if (pos.error) return apiInternalError(pos.error, "inbox purchase_orders");
    if (invs.error) return apiInternalError(invs.error, "inbox invoices");

    const result = buildApprovalInbox({
      certificates: (certs.data ?? []).map((c) => ({
        public_id: c.public_id as string,
        customer_name: (c.customer_name as string | null) ?? null,
        service_type: (c.service_type as string | null) ?? null,
      })),
      purchaseOrders: (pos.data ?? []).map((p) => {
        const supplier = Array.isArray(p.suppliers) ? p.suppliers[0] : p.suppliers;
        return {
          id: p.id as string,
          po_number: (p.po_number as string | null) ?? null,
          subtotal: (p.subtotal as number | null) ?? null,
          supplier_name: ((supplier as { name?: string | null } | null)?.name as string | null) ?? null,
        };
      }),
      invoices: (invs.data ?? []).map((d) => ({
        id: d.id as string,
        doc_number: (d.doc_number as string | null) ?? null,
        recipient_name: (d.recipient_name as string | null) ?? null,
        total: (d.total as number | null) ?? null,
      })),
    });

    return apiJson(result);
  } catch (e) {
    return apiInternalError(e, "admin/inbox GET");
  }
}
