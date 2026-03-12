import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("ja-JP");
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  certificate_issued: { label: "証明書発行", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  certificate_voided: { label: "証明書無効化", color: "text-red-700 bg-red-50 border-red-200" },
  vehicle_registered: { label: "車両登録", color: "text-blue-700 bg-blue-50 border-blue-200" },
  vehicle_updated: { label: "車両更新", color: "text-neutral-700 bg-neutral-50 border-neutral-200" },
  note: { label: "メモ", color: "text-neutral-700 bg-neutral-50 border-neutral-200" },
};

function TypeBadge({ type }: { type: string }) {
  const meta = TYPE_LABELS[type] ?? { label: type, color: "text-neutral-700 bg-neutral-50 border-neutral-200" };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>
      {meta.label}
    </span>
  );
}

export default async function AdminAuditPage() {
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
    return <main className="p-6 text-sm text-neutral-600">tenant が見つかりません。</main>;
  }
  const tenantId = membership.tenant_id as string;

  // Fetch recent vehicle histories (acts as audit log)
  const { data: histories, error } = await supabase
    .from("vehicle_histories")
    .select("id,vehicle_id,type,title,description,performed_at,certificate_id,created_at")
    .eq("tenant_id", tenantId)
    .order("performed_at", { ascending: false })
    .limit(200);

  if (error) {
    return <main className="p-6 text-sm text-red-700">エラー: {error.message}</main>;
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
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              AUDIT LOG
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">操作履歴</h1>
              <p className="mt-2 text-sm text-neutral-600">
                車両・証明書に関する操作履歴を時系列で表示します。
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボード
          </Link>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TOTAL EVENTS</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{rows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">直近 200 件を表示</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTIFICATES ISSUED</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">
              {rows.filter((r) => r.type === "certificate_issued").length}
            </div>
            <div className="mt-1 text-xs text-neutral-500">証明書発行イベント数</div>
          </div>
        </section>

        {/* Log list */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-100">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">EVENTS</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">操作イベント一覧</div>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              操作履歴がありません。
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {rows.map((h) => (
                <div key={h.id} className="p-4 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      <TypeBadge type={h.type ?? ""} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-neutral-900">
                          {h.title ?? h.type}
                        </span>
                        {h.vehicle_id && vehicleMap[h.vehicle_id] && (
                          <Link
                            href={`/admin/vehicles/${h.vehicle_id}`}
                            className="text-xs text-neutral-500 hover:text-neutral-800 hover:underline"
                          >
                            {vehicleMap[h.vehicle_id]}
                          </Link>
                        )}
                        {h.certificate_id && (
                          <span className="text-xs text-neutral-400">
                            cert: {String(h.certificate_id).slice(0, 8)}…
                          </span>
                        )}
                      </div>
                      {h.description && (
                        <p className="mt-1 text-xs text-neutral-500 break-all">{h.description}</p>
                      )}
                      <p className="mt-1 text-[11px] text-neutral-400">{fmt(h.performed_at ?? h.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
