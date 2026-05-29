import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import FirstUseInlineGuide from "@/components/ui/FirstUseInlineGuide";
import JobStatusPanel from "./JobStatusPanel";
import JobAiSuggestPanel from "./JobAiSuggestPanel";
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

  // この顧客向け LINE outbound の未配信件数 (過去 30 日、clientWithRetry が記録するもの)
  let failedLineCount = 0;
  if (customer?.id) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("customer_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("customer_id", customer.id)
      .eq("channel", "line")
      .eq("direction", "outbound")
      .not("failed_at", "is", null)
      .gte("created_at", since);
    failedLineCount = count ?? 0;
  }

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

      {failedLineCount > 0 && customer?.id && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="mr-1">⚠</span>
          この顧客への LINE 通知が <strong>{failedLineCount}</strong> 件未配信です (過去 30 日)。 重要通知
          (作業完了・帳票・予約確認) は SMS フォールバックを自動試行しています。 詳細は{" "}
          <Link href={`/admin/customers/${customer.id}/messages`} className="font-medium underline">
            顧客メッセージ履歴
          </Link>{" "}
          で確認してください。
        </div>
      )}

      <FirstUseInlineGuide
        storageKey="jobs_detail"
        title="案件ワークフローの使い方"
        description="1件のお客様の予約 → 作業 → 証明書 → 請求 までを、画面遷移せずにこの1画面で完結できます。"
        steps={[
          {
            title: "ステッパーで進捗を進める",
            description: "上部の「予約確定 → 来店 → 作業中 → 完了」を順にクリックすると、現在の状態が更新されます。",
          },
          {
            title: "次アクションで作業を起動",
            description:
              "ステータスに応じて「🪪 証明書を発行」「💰 請求書を作成」などのボタンが表示されます。車両IDと顧客IDが自動で引き継がれます。",
          },
          {
            title: "タブで関連情報を一覧",
            description: "サマリ / 顧客・車両 / 証明書 / 請求 のタブで、この案件に紐付くデータをまとめて確認できます。",
          },
        ]}
      />

      {/* ステッパー + 次アクション: 軽量データのみで即時描画 (店頭モードでは非表示) */}
      <JobStatusPanel
        reservation={reservation as JobReservation}
        customerId={reservation.customer_id}
        vehicleId={reservation.vehicle_id}
      />

      {/* AI 提案: マウント後に POST、結果が無ければ静かに非表示 */}
      <JobAiSuggestPanel
        reservationId={reservation.id as string}
        currentTitle={(reservation.title as string | null) ?? null}
        customerId={(reservation.customer_id as string | null) ?? null}
        vehicleId={(reservation.vehicle_id as string | null) ?? null}
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
          <div key={i} className="h-9 w-28 rounded-t-md bg-border-subtle dark:bg-[rgba(255,255,255,0.08)] mb-0" />
        ))}
      </div>
      {/* コンテンツ: 2カラムカード風 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-border-subtle bg-surface p-5 space-y-3">
            <div className="h-3 w-20 bg-border-subtle dark:bg-[rgba(255,255,255,0.08)] rounded" />
            <div className="h-4 w-full bg-border-subtle dark:bg-[rgba(255,255,255,0.06)] rounded" />
            <div className="h-4 w-5/6 bg-border-subtle dark:bg-[rgba(255,255,255,0.06)] rounded" />
            <div className="h-4 w-2/3 bg-border-subtle dark:bg-[rgba(255,255,255,0.06)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
