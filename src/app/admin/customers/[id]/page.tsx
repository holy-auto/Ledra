import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerWithRole, requirePermission } from "@/lib/auth/checkRole";
import PageHeader from "@/components/ui/PageHeader";
import CustomerDetailClient from "./CustomerDetailClient";
import CustomerLineLinkCard from "./CustomerLineLinkCard";
import CustomerNextActionPanel from "./CustomerNextActionPanel";
import CustomerTabs from "./CustomerTabs";
import { deriveSignals, type CustomerSignals } from "@/lib/customers/signals";
import { getOrCreateCustomerSummary } from "@/lib/customers/getOrCreateAiSummary";

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
  const { data, error } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
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
      <div className="space-y-6">
        <div className="glass-card p-4 text-sm text-danger">テナントが見つかりません。</div>
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
        <div className="glass-card p-4 text-sm text-danger">顧客が見つかりません。</div>
        <Link href="/admin/customers" className="text-sm underline text-accent">
          一覧に戻る
        </Link>
      </div>
    );
  }

  // 紐付くデータを並列取得 (tenant 名は AI サマリの shopName に流す)
  const [vehiclesRes, certificatesRes, reservationsRes, invoiceDocsRes, tenantRes] = await Promise.all([
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
      .select("id, title, status, scheduled_date, start_time, end_time, estimated_amount")
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
    supabase.from("tenants").select("name, line_enabled").eq("id", tenantId).maybeSingle(),
  ]);

  const vehicles = vehiclesRes.data ?? [];
  const certificates = certificatesRes.data ?? [];
  const reservations = reservationsRes.data ?? [];
  const invoices = invoiceDocsRes.data ?? [];
  const shopName = (tenantRes.data?.name as string | undefined) ?? undefined;
  const lineEnabled = Boolean(tenantRes.data?.line_enabled);
  const lineLinked = Boolean((customer as { line_user_id?: string | null }).line_user_id);
  // 連携コード発行は書き込み操作。閲覧のみロール（viewer 等）には発行UIを出さない。
  const caller = await resolveCallerWithRole(supabase);
  const canIssueLineCode = caller ? requirePermission(caller, "customers:edit") : false;

  const signals = deriveSignals({
    customer: { id, created_at: customer.created_at },
    vehicles,
    certificates,
    reservations,
    invoices,
  });

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

      {/* LINE 連携（連携コード発行 / 状態表示） */}
      <CustomerLineLinkCard
        customerId={id}
        initialLinked={lineLinked}
        lineEnabled={lineEnabled}
        canIssue={canIssueLineCode}
      />

      {/* 次のアクション。signals はサーバ側で確定済みなので即時表示。
          AI サマリは Suspense で並行ストリーム (失敗 / 未生成でも signals だけで動く)。 */}
      <Suspense fallback={<CustomerNextActionPanel signals={signals} />}>
        <CustomerNextActionWithSummary
          signals={signals}
          tenantId={tenantId}
          customerId={id}
          customerName={customer.name ?? "お客様"}
          shopName={shopName}
        />
      </Suspense>

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

/**
 * AI サマリを fetch / generate してから NextActionPanel を再描画する。
 * Suspense の fallback として "summary なし" 版が先に表示され、これが解決
 * すると summary 入りに差し替わる。
 *
 * service-role 経由で書き込みするため createTenantScopedAdmin を使う
 * (RLS は tenant_id で絞っているのでテナント越境はしない)。
 */
async function CustomerNextActionWithSummary({
  signals,
  tenantId,
  customerId,
  customerName,
  shopName,
}: {
  signals: CustomerSignals;
  tenantId: string;
  customerId: string;
  customerName: string;
  shopName?: string;
}) {
  const { admin } = createTenantScopedAdmin(tenantId);
  let summary: string | null = null;
  try {
    const result = await getOrCreateCustomerSummary({
      supabase: admin,
      tenantId,
      customerId,
      customerName,
      shopName,
      signals,
    });
    summary = result?.summary ?? null;
  } catch (err) {
    // AI / DB のどちらかが落ちても deterministic panel に降格するだけ
    console.error("[customers/[id]] summary fetch failed:", err);
  }
  return <CustomerNextActionPanel signals={signals} summary={summary} />;
}
