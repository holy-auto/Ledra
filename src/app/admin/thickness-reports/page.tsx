import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import PageHeader from "@/components/ui/PageHeader";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type StatusFilter = "unlinked" | "linked" | "all";

const TAB_LABEL: Record<StatusFilter, string> = {
  unlinked: "未紐付け",
  linked: "紐付け済み",
  all: "すべて",
};

const TAB_ORDER: StatusFilter[] = ["unlinked", "linked", "all"];

function parseStatus(raw: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "linked" || v === "all" || v === "unlinked") return v;
  return "unlinked";
}

type ReportRow = {
  id: string;
  name: string | null;
  measured_at: string | null;
  device_serial_number: string | null;
  brand: string | null;
  model: string | null;
  vin: string | null;
  year: string | null;
  vehicle_id: string | null;
  vehicle: { id: string; maker: string | null; model: string | null; plate_display: string | null } | null;
};

export default async function ThicknessReportsListPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const status = parseStatus(sp.status);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/thickness-reports");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <div className="p-6 text-primary">tenant が見つかりません。</div>;
  }
  const tenantId = membership.tenant_id as string;

  // 件数集計（タブごとのバッジ用）
  const [unlinkedCountRes, linkedCountRes, totalCountRes] = await Promise.all([
    supabase
      .from("thickness_reports")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("vehicle_id", null),
    supabase
      .from("thickness_reports")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .not("vehicle_id", "is", null),
    supabase.from("thickness_reports").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);

  const counts: Record<StatusFilter, number> = {
    unlinked: unlinkedCountRes.count ?? 0,
    linked: linkedCountRes.count ?? 0,
    all: totalCountRes.count ?? 0,
  };

  // フィルタ済みリスト取得
  let query = supabase
    .from("thickness_reports")
    .select(
      "id, name, measured_at, device_serial_number, brand, model, vin, year, vehicle_id, vehicle:vehicles(id, maker, model, plate_display)",
    )
    .eq("tenant_id", tenantId)
    .order("measured_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (status === "unlinked") query = query.is("vehicle_id", null);
  else if (status === "linked") query = query.not("vehicle_id", "is", null);

  const queryResult = await query.returns<ReportRow[]>();
  const reports: ReportRow[] = queryResult.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        tag="膜厚測定"
        title="膜厚測定レポート"
        description="NexPTGアプリから取り込んだ測定レポートの一覧です。VINで車両に自動紐付けされなかったレポートも確認できます。"
        actions={
          <Link href="/admin/vehicles" className="btn-secondary">
            車両一覧へ
          </Link>
        }
      />

      {/* タブ */}
      <div className="flex gap-1 border-b border-border-default">
        {TAB_ORDER.map((tab) => {
          const isActive = status === tab;
          return (
            <Link
              key={tab}
              href={`/admin/thickness-reports?status=${tab}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-accent text-primary"
                  : "border-transparent text-muted hover:text-secondary"
              }`}
            >
              {TAB_LABEL[tab]}
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-inset px-2 py-0.5 text-[11px] font-mono text-secondary">
                {counts[tab]}
              </span>
            </Link>
          );
        })}
      </div>

      {/* リスト */}
      <section className="glass-card p-0 overflow-hidden">
        {reports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted border-b border-border-default bg-inset">
                  <th className="text-left py-2 px-3 font-medium">測定日時</th>
                  <th className="text-left py-2 px-3 font-medium">レポート名</th>
                  <th className="text-left py-2 px-3 font-medium">車両（NexPTG）</th>
                  <th className="text-left py-2 px-3 font-medium">VIN</th>
                  <th className="text-left py-2 px-3 font-medium">紐付け先</th>
                  <th className="text-left py-2 px-3 font-medium">機器</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const detailHref = r.vehicle_id
                    ? `/admin/vehicles/${r.vehicle_id}/thickness/${r.id}`
                    : `/admin/thickness-reports/${r.id}`;
                  const reportCar = [r.brand, r.model, r.year].filter(Boolean).join(" ") || "—";
                  return (
                    <tr key={r.id} className="border-b border-border-subtle hover:bg-surface-hover transition-colors">
                      <td className="py-2 px-3 text-secondary whitespace-nowrap">
                        <Link href={detailHref} className="block no-underline text-primary hover:underline">
                          {r.measured_at ? formatDateTime(r.measured_at) : "—"}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-primary">
                        <Link href={detailHref} className="no-underline hover:underline">
                          {r.name ?? "(無題)"}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-secondary">{reportCar}</td>
                      <td className="py-2 px-3 font-mono text-xs text-secondary">{r.vin || "—"}</td>
                      <td className="py-2 px-3">
                        {r.vehicle ? (
                          <Link href={`/admin/vehicles/${r.vehicle.id}`} className="text-accent hover:underline">
                            {[r.vehicle.maker, r.vehicle.model].filter(Boolean).join(" ") ||
                              r.vehicle.plate_display ||
                              "車両"}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center rounded-full border border-warning/20 bg-warning-dim px-2 py-0.5 text-[11px] font-semibold text-warning-text">
                            未紐付け
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-muted">{r.device_serial_number ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-muted">
            {status === "unlinked"
              ? "未紐付けのレポートはありません。"
              : status === "linked"
                ? "紐付け済みのレポートはありません。"
                : "膜厚測定レポートはまだありません。NexPTGアプリから同期してください。"}
          </div>
        )}
      </section>

      {status === "unlinked" && reports.length > 0 && (
        <p className="text-xs text-muted">
          ※ 未紐付けのレポートは、NexPTG側のVINがLedra側のいずれの車両のVINとも一致しなかったものです。
          車両の登録時にVINを設定するか、再同期で紐付けされます。
        </p>
      )}
    </div>
  );
}
