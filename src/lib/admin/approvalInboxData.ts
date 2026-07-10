import type { SupabaseClient } from "@supabase/supabase-js";
import { buildApprovalInbox, type InboxSection } from "@/lib/admin/approvalInbox";

/**
 * 承認インボックスのデータ取得（IO）。当テナントで人の承認を待つドラフト
 * （証明書 / 発注 / 請求）を集約して返す。承認インボックス API とダッシュボードの
 * 承認ウィジェットの双方から使う共通関数（クエリの二重管理を避ける）。
 * RLS + 明示の tenant_id で当テナントに限定。純粋な整形は buildApprovalInbox に委譲。
 */
export async function fetchApprovalInbox(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ sections: InboxSection[]; total: number }> {
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

  if (certs.error) throw certs.error;
  if (pos.error) throw pos.error;
  if (invs.error) throw invs.error;

  return buildApprovalInbox({
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
}
