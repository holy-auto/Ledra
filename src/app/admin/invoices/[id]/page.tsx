import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import InvoiceDetailClient from "./InvoiceDetailClient";

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();
  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/invoices");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div className="glass-card p-4 text-sm text-red-500">テナントが見つかりません。</div>
      </div>
    );
  }

  const { data: invoiceDoc, error: invErr } = await supabase
    .from("documents")
    .select("id, tenant_id, customer_id, doc_type, doc_number, issued_at, due_date, status, subtotal, tax, total, tax_rate, items_json, note, is_invoice_compliant, show_seal, show_logo, show_bank_info, recipient_name, created_at, updated_at")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .eq("doc_type", "invoice")
    .single();
  // Map doc_number to invoice_number for backward compatibility
  const invoice = invoiceDoc ? { ...invoiceDoc, invoice_number: invoiceDoc.doc_number } : null;

  if (invErr || !invoice) {
    return (
      <div className="space-y-6">
        <PageHeader tag="INVOICES" title="請求書詳細" />
        <div className="glass-card p-4 text-sm text-red-500">請求書が見つかりません。</div>
        <Link href="/admin/invoices" className="text-sm underline text-accent">一覧に戻る</Link>
      </div>
    );
  }

  // 顧客名
  let customerName: string | null = null;
  if (invoice.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", invoice.customer_id)
      .single();
    customerName = cust?.name ?? null;
  }

  // テナント情報（インボイス用）
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, address, contact_email, contact_phone, registration_number, bank_info")
    .eq("id", tenantId)
    .single();

  return (
    <div className="space-y-6">
      <PageHeader
        tag="INVOICES"
        title="請求書詳細"
        actions={
          <Link href="/admin/invoices" className="btn-secondary">一覧に戻る</Link>
        }
      />

      <InvoiceDetailClient invoice={invoice} customerName={customerName} tenant={tenant} />
    </div>
  );
}
