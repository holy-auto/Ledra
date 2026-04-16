import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import CustomerDetailClient from "./CustomerDetailClient";
import CustomerTabs from "./CustomerTabs";

/**
 * 顧客詳細 (360° ビュー)
 * ------------------------------------------------------------
 * 顧客基本情報 + 車両 / 証明書 / 予約・案件 / 請求 をタブで横断表示。
 * 既存の個別ページに画面遷移せずとも、顧客単位で全貌を把握できる。
 *
 * レンダリング戦略:
 * - 紐付くデータ (vehicles/certificates/reservations/invoices) は Promise.all で並列取得
 * - 予約は /admin/jobs/[id] の案件ワークフローに 1 クリックで遷移
 */

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

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/customers");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <div className="glass-card p-4 text-sm text-danger">
          テナントが見つかりません。
        </div>
      </div>
    );
  }

  // 顧客本体
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (custErr || !customer) {
    return (
      <div className="space-y-6">
        <PageHeader tag="CUSTOMERS" title="顧客詳細" />
        <div className="glass-card p-4 text-sm text-danger">
          顧客が見つかりません。
        </div>
        <Link
          href="/admin/customers"
          className="text-sm underline text-accent"
        >
          一覧に戻る
        </Link>
      </div>
    );
  }

  // 紐付くデータを並列取得
  const [vehiclesRes, certificatesRes, reservationsRes, invoiceDocsRes] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("id, maker, model, year, plate_display")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("certificates")
        .select("public_id, status, customer_name, created_at, service_price")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("reservations")
        .select(
          "id, title, status, scheduled_date, start_time, end_time, estimated_amount",
        )
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .order("scheduled_date", { ascending: false }),
      supabase
        .from("documents")
        .select("id, doc_number, status, total, issued_at, due_date")
        .eq("tenant_id", tenantId)
        .eq("customer_id", id)
        .in("doc_type", ["invoice", "consolidated_invoice"])
        .order("created_at", { ascending: false }),
    ]);

  const vehicles = vehiclesRes.data ?? [];
  const certificates = certificatesRes.data ?? [];
  const reservations = reservationsRes.data ?? [];
  const invoices = invoiceDocsRes.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="CUSTOMERS"
        title="顧客詳細"
        actions={
          <Link href="/admin/customers" className="btn-secondary">
            一覧に戻る
          </Link>
        }
      />

      {/* Customer Info + Edit */}
      <CustomerDetailClient customer={customer} />

      {/* 360° Tabs */}
      <CustomerTabs
        customerId={id}
        vehicles={vehicles}
        certificates={certificates}
        reservations={reservations}
        invoices={invoices}
      />
    </div>
  );
}
