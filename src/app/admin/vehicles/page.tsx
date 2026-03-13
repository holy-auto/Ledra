import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function fmt(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString("ja-JP");
}

export default async function AdminVehicleListPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/vehicles");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return (
      <main className="p-6">
        <p className="text-sm text-neutral-600">tenant_memberships が見つかりません。</p>
      </main>
    );
  }

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select(
      "id,maker,model,year,plate_display,customer_name,customer_email,notes,created_at,updated_at"
    )
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <main className="p-6">
        <p className="text-sm text-red-700">車両データ読み込みエラー: {error.message}</p>
      </main>
    );
  }

  const rows = vehicles ?? [];

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              VEHICLES
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">
                車両一覧
              </h1>
              <p className="mt-2 text-sm text-neutral-600">
                登録済み車両の確認・詳細閲覧・証明書発行への導線。
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
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
              + 車両を登録
            </Link>
          </div>
        </header>

        {/* Stats */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">TOTAL</div>
            <div className="mt-2 text-2xl font-bold text-neutral-900">{rows.length}</div>
            <div className="mt-1 text-xs text-neutral-500">登録車両数</div>
          </div>
        </section>

        {/* Table */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">VEHICLE LIST</div>
            <div className="mt-1 text-lg font-semibold text-neutral-900">車両リスト</div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-xl bg-neutral-50 p-8 text-center">
              <p className="text-sm text-neutral-500">
                車両が登録されていません。
              </p>
              <Link
                href="/admin/vehicles/new"
                className="mt-4 inline-block rounded-xl border border-neutral-900 bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
              >
                最初の車両を登録する
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="p-3 text-left font-semibold text-neutral-600">登録日</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">メーカー</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">車種</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">年式</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">ナンバー</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">顧客名</th>
                    <th className="p-3 text-left font-semibold text-neutral-600">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} className="border-t hover:bg-neutral-50">
                      <td className="p-3 whitespace-nowrap text-neutral-600">
                        {fmt(v.created_at)}
                      </td>
                      <td className="p-3 font-medium text-neutral-900">
                        {v.maker || "-"}
                      </td>
                      <td className="p-3 text-neutral-900">
                        {v.model || "-"}
                      </td>
                      <td className="p-3 text-neutral-600">
                        {v.year ? String(v.year) : "-"}
                      </td>
                      <td className="p-3 font-mono text-neutral-900">
                        {v.plate_display || "-"}
                      </td>
                      <td className="p-3 text-neutral-900">
                        {v.customer_name || "-"}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <Link
                            href={`/admin/vehicles/${v.id}`}
                            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                          >
                            詳細
                          </Link>
                          <Link
                            href={`/admin/certificates/new?vehicleId=${v.id}`}
                            className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700"
                          >
                            証明書発行
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
