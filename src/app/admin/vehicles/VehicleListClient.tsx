"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/format";
import { useUiPreferences } from "@/lib/ui-preferences/UiPreferencesContext";
import { getVehicleListPresentation } from "@/lib/ui-preferences/vehiclesPresentation";
import VehicleListActions from "./VehicleListActions";

export type VehicleListRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  vin_code: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  customer_id: string | null;
  customer: { id: string; name: string | null } | null;
};

export default function VehicleListClient({ rows, total }: { rows: VehicleListRow[]; total: number }) {
  const { displayMode } = useUiPreferences();
  const presentation = getVehicleListPresentation(displayMode);
  const isDense = presentation.variant === "dense";

  return (
    <div className={isDense ? "space-y-3" : "space-y-6"}>
      <PageHeader
        tag="車両管理"
        title="車両一覧"
        description={
          presentation.variant === "simple"
            ? "確認したい車両を選んでください。"
            : "登録済み車両の確認・詳細閲覧・証明書発行への導線。"
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {presentation.showBulkActions ? (
              <>
                <Link href="/admin" className="btn-secondary">
                  ダッシュボード
                </Link>
                <VehicleListActions />
              </>
            ) : (
              <Link href="/admin/vehicles/new" className="btn-primary">
                + 車両を登録
              </Link>
            )}
          </div>
        }
      />

      {presentation.showStats && (
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="glass-card p-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-muted">合計</div>
            <div className="mt-2 text-2xl font-bold text-primary">{total}</div>
            <div className="mt-1 text-xs text-muted">登録車両数</div>
          </div>
        </section>
      )}

      {total > rows.length && (
        <div className="rounded-xl border border-border-subtle bg-inset px-4 py-3 text-xs text-secondary">
          新しい車両から{rows.length}件を表示しています。目的の車両が見つからない場合は検索機能をご利用ください。
        </div>
      )}

      {rows.length === 0 ? (
        <section className="glass-card p-8 text-center">
          <p className="text-sm text-muted">車両が登録されていません。</p>
          <Link href="/admin/vehicles/new" className="btn-primary mt-4 inline-block">
            最初の車両を登録する
          </Link>
        </section>
      ) : presentation.variant === "simple" ? (
        <section className="grid gap-4 md:grid-cols-2">
          {rows.map((vehicle) => (
            <article key={vehicle.id} className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold text-primary">
                    {[vehicle.maker, vehicle.model].filter(Boolean).join(" ") || "車種未登録"}
                  </h2>
                  <p className="mt-1 text-base font-semibold text-secondary">
                    {vehicle.plate_display || "ナンバー未登録"}
                  </p>
                </div>
                {vehicle.year && (
                  <span className="shrink-0 rounded-full bg-inset px-3 py-1 text-xs text-secondary">
                    {vehicle.year}年
                  </span>
                )}
              </div>
              <p className="mt-4 text-sm text-secondary">所有者：{vehicle.customer?.name || "未登録"}</p>
              <Link
                href={`/admin/vehicles/${vehicle.id}`}
                className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 py-3 text-base font-bold text-white"
              >
                車両を開く
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="glass-card overflow-hidden">
          <div className={`border-b border-border-subtle ${isDense ? "px-4 py-2" : "p-5"}`}>
            <div className={`${isDense ? "text-[11px]" : "text-xs"} font-semibold tracking-[0.18em] text-muted`}>
              車両リスト（{total}件）
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className={`min-w-full ${isDense ? "text-xs" : "text-sm"}`}>
              <thead className="bg-surface-hover">
                <tr>
                  {!isDense && <th className="p-3 text-left text-xs font-semibold text-muted">登録日</th>}
                  <th className={`${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}>
                    メーカー
                  </th>
                  <th className={`${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}>
                    車種
                  </th>
                  <th
                    className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}
                  >
                    年式
                  </th>
                  <th
                    className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}
                  >
                    ナンバー
                  </th>
                  {!isDense && (
                    <th className="hidden md:table-cell p-3 text-left text-xs font-semibold text-muted">車体番号</th>
                  )}
                  <th
                    className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}
                  >
                    所有者
                  </th>
                  <th className={`${isDense ? "px-2 py-1.5" : "p-3"} text-left text-xs font-semibold text-muted`}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((vehicle) => (
                  <tr key={vehicle.id} className="hover:bg-surface-hover/60">
                    {!isDense && (
                      <td className="p-3 whitespace-nowrap text-secondary">{formatDate(vehicle.created_at)}</td>
                    )}
                    <td className={`${isDense ? "px-2 py-1.5" : "p-3"} font-medium text-primary`}>
                      {vehicle.maker || "-"}
                    </td>
                    <td className={`${isDense ? "px-2 py-1.5" : "p-3"} text-primary`}>{vehicle.model || "-"}</td>
                    <td className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} text-secondary`}>
                      {vehicle.year ? String(vehicle.year) : "-"}
                    </td>
                    <td className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} font-mono text-primary`}>
                      {vehicle.plate_display || "-"}
                    </td>
                    {!isDense && (
                      <td className="hidden md:table-cell p-3 font-mono text-xs text-secondary">
                        {vehicle.vin_code || "-"}
                      </td>
                    )}
                    <td className={`hidden sm:table-cell ${isDense ? "px-2 py-1.5" : "p-3"} text-secondary`}>
                      {vehicle.customer?.name || "-"}
                    </td>
                    <td className={isDense ? "px-2 py-1" : "p-3"}>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/admin/vehicles/${vehicle.id}`}
                          className={`btn-ghost ${isDense ? "px-2 py-1 text-[11px]" : "px-3 py-1 text-xs"}`}
                        >
                          詳細
                        </Link>
                        {!isDense && (
                          <Link
                            href={`/admin/certificates/new?vehicleId=${vehicle.id}`}
                            className="btn-primary px-3 py-1.5 text-xs"
                          >
                            証明書発行
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
