import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  certificate_issued: { label: "証明書発行", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  certificate_voided: { label: "証明書無効化", color: "text-red-500 bg-red-500/10 border-red-500/30" },
  certificate_viewed: { label: "証明書閲覧", color: "text-accent-text bg-accent-dim border-accent/15" },
  certificate_pdf_generated: { label: "PDF生成", color: "text-accent-text bg-accent-dim border-accent/15" },
  certificate_pdf_batch: { label: "PDF一括生成", color: "text-accent-text bg-accent-dim border-accent/15" },
  certificate_public_viewed: { label: "公開ページ閲覧", color: "text-violet-600 bg-violet-500/10 border-violet-500/30" },
  certificate_public_pdf: { label: "公開PDF閲覧", color: "text-violet-600 bg-violet-500/10 border-violet-500/30" },
  vehicle_registered: { label: "車両登録", color: "text-blue-600 bg-blue-500/10 border-blue-500/30" },
  vehicle_updated: { label: "車両更新", color: "text-zinc-600 bg-zinc-500/10 border-zinc-500/30" },
  member_added: { label: "メンバー追加", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  member_removed: { label: "メンバー削除", color: "text-red-500 bg-red-500/10 border-red-500/30" },
  member_role_changed: { label: "ロール変更", color: "text-amber-600 bg-amber-500/10 border-amber-500/30" },
  reservation_created: { label: "予約作成", color: "text-blue-600 bg-blue-500/10 border-blue-500/30" },
  reservation_completed: { label: "予約完了", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  reservation_cancelled: { label: "予約キャンセル", color: "text-red-500 bg-red-500/10 border-red-500/30" },
  invoice_created: { label: "請求書作成", color: "text-blue-600 bg-blue-500/10 border-blue-500/30" },
  invoice_paid: { label: "入金記録", color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30" },
  note: { label: "メモ", color: "text-zinc-600 bg-zinc-500/10 border-zinc-500/30" },
};

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_LABELS[type] ?? { label: type, color: "text-zinc-600 bg-zinc-500/10 border-zinc-500/30" };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const filterType = params.type ?? "";
  const filterFrom = params.from ?? "";
  const filterTo = params.to ?? "";

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/audit");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <div className="text-sm text-muted">tenant が見つかりません。</div>;
  }
  const tenantId = membership.tenant_id as string;

  // Fetch recent vehicle histories (acts as audit log)
  let query = supabase
    .from("vehicle_histories")
    .select("id,vehicle_id,type,title,description,performed_at,certificate_id,created_at")
    .eq("tenant_id", tenantId)
    .order("performed_at", { ascending: false })
    .limit(200);

  if (filterType) {
    query = query.eq("type", filterType);
  }
  if (filterFrom) {
    query = query.gte("performed_at", `${filterFrom}T00:00:00`);
  }
  if (filterTo) {
    query = query.lte("performed_at", `${filterTo}T23:59:59`);
  }

  const { data: histories, error } = await query;

  if (error) {
    return <div className="text-sm text-red-500">エラー: {error.message}</div>;
  }

  // Fetch vehicle names for display
  const vehicleIds = [...new Set((histories ?? []).map((h) => h.vehicle_id).filter(Boolean))];
  const vehicleMap: Record<string, string> = {};
  if (vehicleIds.length > 0) {
    const { data: vRows } = await supabase
      .from("vehicles")
      .select("id,maker,model,year,plate_display,customer_name")
      .in("id", vehicleIds as string[]);
    for (const v of vRows ?? []) {
      const label = [v.maker, v.model, v.year ? String(v.year) : null]
        .filter(Boolean).join(" ") || "車両";
      vehicleMap[v.id] = v.plate_display ? `${label} / ${v.plate_display}` : label;
    }
  }

  const rows = histories ?? [];

  return (
    <div className="space-y-6">

        <PageHeader
          tag="監査ログ"
          title="操作履歴"
          description="車両・証明書に関する操作履歴を時系列で表示します。"
          actions={
            <Link
              href="/admin"
              className="btn-secondary"
            >
              ダッシュボード
            </Link>
          }
        />

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計イベント</div>
            <div className="mt-2 text-2xl font-bold text-primary">{rows.length}</div>
            <div className="mt-1 text-xs text-muted">直近 200 件を表示</div>
          </div>
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">発行済証明書</div>
            <div className="mt-2 text-2xl font-bold text-primary">
              {rows.filter((r) => r.type === "certificate_issued").length}
            </div>
            <div className="mt-1 text-xs text-muted">証明書発行イベント数</div>
          </div>
        </section>

        {/* Filters */}
        <section className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted mb-3">フィルター</div>
          <form className="flex gap-3 items-end flex-wrap">
            <div className="min-w-[160px] space-y-1">
              <label className="text-xs text-muted">イベントタイプ</label>
              <select name="type" defaultValue={filterType} className="input-field">
                <option value="">すべて</option>
                {Object.entries(TYPE_LABELS).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] space-y-1">
              <label className="text-xs text-muted">開始日</label>
              <input type="date" name="from" defaultValue={filterFrom} className="input-field" />
            </div>
            <div className="min-w-[140px] space-y-1">
              <label className="text-xs text-muted">終了日</label>
              <input type="date" name="to" defaultValue={filterTo} className="input-field" />
            </div>
            <button type="submit" className="btn-primary">絞り込み</button>
            <a href="/admin/audit" className="btn-secondary">リセット</a>
          </form>
        </section>

        {/* Log list */}
        <section className="glass-card">
          <div className="p-5 border-b border-border-subtle">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">イベント</div>
            <div className="mt-1 text-base font-semibold text-primary">操作イベント一覧</div>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              操作履歴がありません。
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {rows.map((h) => (
                <div key={h.id} className="p-4 hover:bg-surface-hover transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <TypeBadge type={h.type ?? ""} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-primary">
                          {h.title ?? h.type}
                        </span>
                        {h.vehicle_id && vehicleMap[h.vehicle_id] && (
                          <Link
                            href={`/admin/vehicles/${h.vehicle_id}`}
                            className="text-xs text-muted hover:text-primary hover:underline"
                          >
                            {vehicleMap[h.vehicle_id]}
                          </Link>
                        )}
                        {h.certificate_id && (
                          <span className="text-xs text-muted">
                            cert: {String(h.certificate_id).slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <p className="mt-1 text-xs text-muted break-all">{h.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-muted">{formatDateTime(h.performed_at ?? h.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

    </div>
  );
}
