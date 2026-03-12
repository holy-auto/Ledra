import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

export default async function AdminCustomersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/customers");

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

  // Fetch all vehicles (= customer records)
  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id,maker,model,year,plate_display,customer_name,customer_email,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("customer_name", { ascending: true })
    .limit(500);

  if (error) {
    return <main className="p-6 text-sm text-red-700">エラー: {error.message}</main>;
  }

  // Fetch cert counts per vehicle
  const vehicleIds = (vehicles ?? []).map((v) => v.id);
  let certCountMap: Record<string, number> = {};
  if (vehicleIds.length > 0) {
    const { data: certRows } = await supabase
      .from("certificates")
      .select("vehicle_id, status")
      .eq("tenant_id", tenantId)
      .in("vehicle_id", vehicleIds);
    for (const c of certRows ?? []) {
      if (c.vehicle_id) {
        certCountMap[c.vehicle_id] = (certCountMap[c.vehicle_id] ?? 0) + 1;
      }
    }
  }

  // Group vehicles by customer (customer_name + customer_email)
  type CustomerGroup = {
    key: string;
    name: string;
    email: string | null;
    vehicles: typeof vehicles;
    totalCerts: number;
    latestAt: string | null;
  };

  const groupMap = new Map<string, CustomerGroup>();
  for (const v of vehicles ?? []) {
    const name = (v.customer_name ?? "").trim() || "（名前なし）";
    const email = (v.customer_email as string | null) ?? null;
    const key = `${name}___${email ?? ""}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { key, name, email, vehicles: [], totalCerts: 0, latestAt: null });
    }
    const g = groupMap.get(key)!;
    g.vehicles!.push(v);
    g.totalCerts += certCountMap[v.id] ?? 0;
    if (!g.latestAt || (v.updated_at && v.updated_at > g.latestAt)) {
      g.latestAt = (v.updated_at as string | null) ?? null;
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ja")
  );

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              CUSTOMERS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">顧客管理</h1>
              <p className="mt-2 text-sm text-neutral-600">
                登録車両に紐づく顧客の一覧です。
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/admin"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ダッシュボード
            </Link>
            <Link
              href="/admin/vehicles/new"
              className="rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              ＋ 車両を登録
            </Link>
          </div>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CUSTOMERS</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{groups.length}</div>
            <div className="mt-1 text-xs text-neutral-500">顧客数（ユニーク）</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLES</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{(vehicles ?? []).length}</div>
            <div className="mt-1 text-xs text-neutral-500">登録車両数</div>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">CERTS</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">
              {Object.values(certCountMap).reduce((a, b) => a + b, 0)}
            </div>
            <div className="mt-1 text-xs text-neutral-500">合計発行証明書</div>
          </div>
        </section>

        {/* Customer list */}
        <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="p-5 border-b border-neutral-100">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">LIST</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">顧客一覧</div>
          </div>

          {groups.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-500">
              顧客データがありません。まず車両を登録してください。
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {groups.map((g) => (
                <div key={g.key} className="p-5 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-semibold text-neutral-900">{g.name}</span>
                        {g.email && (
                          <span className="text-sm text-neutral-500">{g.email}</span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                        <span>車両 {g.vehicles!.length} 台</span>
                        <span>証明書 {g.totalCerts} 件</span>
                        {g.latestAt && <span>最終更新 {fmt(g.latestAt)}</span>}
                      </div>

                      {/* Vehicle chips */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {g.vehicles!.map((v) => (
                          <Link
                            key={v.id}
                            href={`/admin/vehicles/${v.id}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
                          >
                            <span>
                              {[v.maker, v.model, v.year ? String(v.year) : null]
                                .filter(Boolean)
                                .join(" ") || "車両"}
                            </span>
                            {v.plate_display && (
                              <span className="text-neutral-400">/ {v.plate_display}</span>
                            )}
                            {certCountMap[v.id] ? (
                              <span className="ml-1 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600">
                                {certCountMap[v.id]}
                              </span>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <Link
                      href={`/admin/certificates/new?customer=${encodeURIComponent(g.name)}`}
                      className="shrink-0 rounded-xl border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      ＋ 証明書
                    </Link>
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
