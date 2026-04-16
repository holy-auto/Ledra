import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import JobStatusPanel from "./JobStatusPanel";
import JobTabsLoader from "./JobTabsLoader";
import type { JobCustomer, JobReservation, JobVehicle } from "./types";

/**
 * 案件ワークフロー (Job Workflow) 画面
 * ------------------------------------------------------------
 * 予約 (reservation) を「案件 (Job)」と捉え、
 *   予約 → チェックイン → 作業 → 写真 → 証明書 → 請求 → 決済
 * の業務フローを 1 画面に集約する統合ワークスペース。
 *
 * レンダリング戦略:
 * 1) reservation / customer / vehicle の軽量データは即時フェッチし、
 *    <JobStatusPanel> (ステッパー + 次アクション) を先に描画
 *    ※ 店頭モードでは StorefrontJobWorkflow が独自にステータス領域を持つため
 *      JobStatusPanel 側は自身で非表示化する。
 * 2) certificates / documents の取得はやや重いため、
 *    <Suspense> で包んだ <JobTabsLoader> から並列取得してストリーミング
 *
 * この分割により「ステータス操作」が一瞬で使える体感を確保する。
 */

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data, error } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function JobWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect(`/login?next=/admin/jobs/${id}`);

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <div className="space-y-6">
        <PageHeader tag="JOB" title="案件ワークフロー" />
        <div className="glass-card p-4 text-sm text-danger">テナントが見つかりません。</div>
      </div>
    );
  }

  // 予約 (案件本体)
  const { data: reservation, error: resErr } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .single();

  if (resErr || !reservation) {
    return (
      <div className="space-y-6">
        <PageHeader
          tag="JOB"
          title="案件ワークフロー"
          actions={
            <Link href="/admin/reservations" className="btn-secondary">
              予約一覧へ
            </Link>
          }
        />
        <div className="glass-card p-4 text-sm text-danger">指定された案件 (予約) が見つかりません。</div>
      </div>
    );
  }

  // 顧客・車両を並列取得
  const [customerRes, vehicleRes] = await Promise.all([
    reservation.customer_id
      ? supabase
          .from("customers")
          .select("id, name, email, phone, company_name")
          .eq("id", reservation.customer_id)
          .eq("tenant_id", tenantId)
          .single()
      : Promise.resolve({ data: null }),
    reservation.vehicle_id
      ? supabase
          .from("vehicles")
          .select("id, maker, model, year, plate_display, vin")
          .eq("id", reservation.vehicle_id)
          .eq("tenant_id", tenantId)
          .single()
      : Promise.resolve({ data: null }),
  ]);
  const customer = customerRes.data as JobCustomer;
  const vehicle = vehicleRes.data as JobVehicle;

  return (
    <main className="space-y-6">
      <PageHeader
        tag="JOB"
        title={`案件: ${reservation.title ?? "(無題)"}`}
        description="予約→作業→証明書→請求→決済 を 1 画面で進行管理します"
        actions={
          <Link href="/admin/reservations" className="btn-secondary">
            予約一覧へ
          </Link>
        }
      />

      {/* ステッパー + 次アクション: 軽量データのみで即時描画 (店頭モードでは非表示) */}
      <JobStatusPanel
        reservation={reservation as JobReservation}
        customerId={reservation.customer_id}
        vehicleId={reservation.vehicle_id}
      />

      {/* 証明書 / 請求 / 見積書: ストリーミング配信 (モードに応じて UI 切替) */}
      <Suspense fallback={<TabsSkeleton />}>
        <JobTabsLoader
          reservation={reservation as JobReservation}
          customer={customer}
          vehicle={vehicle}
          tenantId={tenantId}
        />
      </Suspense>
    </main>
  );
}

function TabsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* タブヘッダ */}
      <div className="flex items-center gap-2 border-b border-border-subtle">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 w-28 rounded-t-md bg-[rgba(0,0,0,0.06)] mb-0" />
        ))}
      </div>
      {/* コンテンツ: 2カラムカード風 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface p-5 space-y-3">
            <div className="h-3 w-20 bg-[rgba(0,0,0,0.06)] rounded" />
            <div className="h-4 w-full bg-[rgba(0,0,0,0.04)] rounded" />
            <div className="h-4 w-5/6 bg-[rgba(0,0,0,0.04)] rounded" />
            <div className="h-4 w-2/3 bg-[rgba(0,0,0,0.04)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
