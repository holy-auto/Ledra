import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/ui/PageHeader";
import VehicleListActions from "./VehicleListActions";

export const dynamic = "force-dynamic";

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
      <div className="space-y-6">
        <p className="text-sm text-muted">tenant_memberships が見つかりません。</p>
      </div>
    );
  }

  const { data: vehicles, error } = await supabase
    .from("vehicles")
    .select("id,maker,model,year,plate_display,vin_code,notes,created_at,updated_at")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-sm text-red-500">車両データ読み込みエラー: {error.message}</p>
      </div>
    );
  }

  const rows = vehicles ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="車両管理"
        title="車両一覧"
        description="登録済み車両の確認・詳細閲覧・証明書発行への導線。"
        actions={
          <div className="flex gap-3 items-center">
            <Link href="/admin" className="btn-secondary">ダッシュボード</Link>
            <VehicleListActions />
          </div>
        }
      />

      {/* Stats */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="glass-card p-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
          <div className="mt-2 text-2xl font-bold text-primary">{rows.length}</div>
          <div className="mt-1 text-xs text-muted">登録車両数</div>
        </div>
      </section>

      {/* Table */}
      <section className="glass-card overflow-hidden">
        <div className="p-5 border-b border-border-subtle">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">車両リスト</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">
              車両が登録されていません。
            </p>
            <Link
              href="/admin/vehicles/new"
              className="btn-primary mt-4 inline-block"
            >
              最初の車両を登録する
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-hover">
                <tr>
                  <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">登録日</th>
                  <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">メーカー</th>
                  <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">車種</th>
                  <th className="hidden sm:table-cell p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">年式</th>
                  <th className="hidden sm:table-cell p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">ナンバー</th>
                  <th className="hidden md:table-cell p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">車体番号</th>
                  <th className="p-3 text-left text-xs font-semibold tracking-[0.12em] text-muted">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((v) => (
                  <tr key={v.id} className="hover:bg-surface-hover/60">
                    <td className="p-3 whitespace-nowrap text-secondary">
                      {formatDate(v.created_at)}
                    </td>
                    <td className="p-3 font-medium text-primary">
                      {v.maker || "-"}
                    </td>
                    <td className="p-3 text-primary">
                      {v.model || "-"}
                    </td>
                    <td className="hidden sm:table-cell p-3 text-secondary">
                      {v.year ? String(v.year) : "-"}
                    </td>
                    <td className="hidden sm:table-cell p-3 font-mono text-primary">
                      {v.plate_display || "-"}
                    </td>
                    <td className="hidden md:table-cell p-3 font-mono text-secondary text-xs">
                      {v.vin_code || "-"}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          href={`/admin/vehicles/${v.id}`}
                          className="btn-ghost !px-3 !py-1 !text-xs"
                        >
                          詳細
                        </Link>
                        <Link
                          href={`/admin/certificates/new?vehicleId=${v.id}`}
                          className="btn-primary !px-3 !py-1.5 !text-xs"
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
  );
}
