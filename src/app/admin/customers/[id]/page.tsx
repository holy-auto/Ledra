import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import CustomerDetailClient from "./CustomerDetailClient";
import { formatDate, formatJpy } from "@/lib/format";

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
  if (!userRes.user) redirect("/login?next=/admin/customers");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <main className="space-y-6">
        <div className="glass-card p-4 text-sm text-red-500">テナントが見つかりません。</div>
      </main>
    );
  }

  // 顧客情報
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (custErr || !customer) {
    return (
      <main className="space-y-6">
        <PageHeader tag="CUSTOMERS" title="顧客詳細" />
        <div className="glass-card p-4 text-sm text-red-500">顧客が見つかりません。</div>
        <Link href="/admin/customers" className="text-sm underline text-[#0071e3]">一覧に戻る</Link>
      </main>
    );
  }

  // 紐付き証明書
  const { data: certificates } = await supabase
    .from("certificates")
    .select("public_id, status, customer_name, created_at, service_price")
    .eq("tenant_id", tenantId)
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  // 紐付き請求書
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total, issued_at, due_date")
    .eq("tenant_id", tenantId)
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  const statusVariant = (s: string) => {
    switch (s) {
      case "active": return "success" as const;
      case "void": return "danger" as const;
      default: return "default" as const;
    }
  };

  const invoiceStatusVariant = (s: string) => {
    switch (s) {
      case "draft": return "default" as const;
      case "sent": return "info" as const;
      case "paid": return "success" as const;
      case "overdue": return "danger" as const;
      case "cancelled": return "warning" as const;
      default: return "default" as const;
    }
  };

  const invoiceStatusLabel = (s: string) => {
    switch (s) {
      case "draft": return "下書き";
      case "sent": return "送付済";
      case "paid": return "入金済";
      case "overdue": return "期限超過";
      case "cancelled": return "キャンセル";
      default: return s;
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        tag="CUSTOMERS"
        title="顧客詳細"
        actions={
          <Link href="/admin/customers" className="btn-secondary">一覧に戻る</Link>
        }
      />

      {/* Customer Info + Edit */}
      <CustomerDetailClient customer={customer} />

      {/* Linked Certificates */}
      <section className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">CERTIFICATES</div>
          <div className="mt-1 text-base font-semibold text-primary">
            紐付き証明書（{(certificates ?? []).length}件）
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">証明書ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">顧客名</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">施工料金</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">発行日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {(certificates ?? []).map((cert) => (
                <tr key={cert.public_id} className="hover:bg-surface-hover/60">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/certificates/${cert.public_id}`}
                      className="font-mono text-[#0071e3] hover:text-[#0077ED] underline"
                    >
                      {cert.public_id}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-secondary">{cert.customer_name ?? "-"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusVariant(cert.status)}>{cert.status}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-secondary">
                    {cert.service_price != null
                      ? formatJpy(cert.service_price)
                      : "-"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                    {formatDate(cert.created_at)}
                  </td>
                </tr>
              ))}
              {(certificates ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">紐付き証明書はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Linked Invoices */}
      <section className="glass-card overflow-hidden">
        <div className="border-b border-border-subtle p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">INVOICES</div>
          <div className="mt-1 text-base font-semibold text-primary">
            紐付き請求書（{(invoices ?? []).length}件）
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-hover">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">請求番号</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">ステータス</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">合計</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">発行日</th>
                <th className="text-left px-5 py-3 text-xs font-semibold tracking-[0.12em] text-muted">支払期限</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {(invoices ?? []).map((inv) => (
                <tr key={inv.id} className="hover:bg-surface-hover/60">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/admin/invoices/${inv.id}`}
                      className="font-mono text-[#0071e3] hover:text-[#0077ED] underline"
                    >
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={invoiceStatusVariant(inv.status)}>
                      {invoiceStatusLabel(inv.status)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 font-medium text-primary">
                    {inv.total != null ? formatJpy(inv.total) : "-"}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                    {formatDate(inv.issued_at)}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-secondary">
                    {formatDate(inv.due_date)}
                  </td>
                </tr>
              ))}
              {(invoices ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted">紐付き請求書はありません</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
