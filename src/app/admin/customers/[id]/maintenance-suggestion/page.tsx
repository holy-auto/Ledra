import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import MaintenanceSuggestionPanel from "@/components/admin/MaintenanceSuggestionPanel";

/**
 * AI整備提案ページ。
 * ------------------------------------------------------------
 * 顧客詳細から遷移し、AI 整備提案パネルを表示する専用ページ。
 * 既存の複雑な顧客詳細ページを改変せず、独立した薄いラッパーとして実装。
 *
 * 顧客名と「最新の車両 (primary vehicle)」をサーバ側で解決し、
 * クライアントの MaintenanceSuggestionPanel に渡す。実際の生成 API
 * (/api/admin/ai/maintenance-suggestion) 側で再度 RBAC/RLS を強制するため、
 * このページは表示用の解決のみを行う。
 */

async function getMyTenantId(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  return (data?.tenant_id as string | undefined) ?? null;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect(`/login?next=/admin/customers/${id}/maintenance-suggestion`);

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader tag="CUSTOMERS" title="AI整備提案" />
        <div className="glass-card p-4 text-sm text-danger">テナントが見つかりません。</div>
      </div>
    );
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!customer) {
    return (
      <div className="space-y-6">
        <PageHeader tag="CUSTOMERS" title="AI整備提案" />
        <div className="glass-card p-4 text-sm text-danger">顧客が見つかりません。</div>
        <Link href="/admin/customers" className="text-sm underline text-accent">
          一覧に戻る
        </Link>
      </div>
    );
  }

  // 最新の車両を primary vehicle として採用 (未指定なら API 側でも最新を採用)。
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <PageHeader
        tag="CUSTOMERS"
        title="AI整備提案"
        actions={
          <Link href={`/admin/customers/${id}`} className="btn-secondary">
            顧客詳細に戻る
          </Link>
        }
      />

      <MaintenanceSuggestionPanel
        customerId={id}
        vehicleId={(vehicle?.id as string | undefined) ?? null}
        customerName={(customer.name as string | null) ?? "お客様"}
      />
    </div>
  );
}
