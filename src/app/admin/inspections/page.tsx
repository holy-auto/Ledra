import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCallerWithRole } from "@/lib/auth/checkRole";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

type VehicleRow = {
  id: string;
  maker: string | null;
  model: string | null;
  year: number | null;
  plate_display: string | null;
  // 顧客情報は customers テーブルに正規化済み（vehicles からは削除）。FK 埋め込みで取得する。
  customers: { name: string | null; email: string | null } | null;
  inspection_expiry_date: string;
  inspection_reminder_sent_at: string | null;
};

type Bucket = {
  key: string;
  label: string;
  tone: string;
  vehicles: Array<VehicleRow & { days_until: number }>;
};

function daysUntil(dateStr: string, today: Date): number {
  const target = new Date(dateStr + "T00:00:00Z");
  const ms = target.getTime() - today.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function vehicleLabel(v: VehicleRow): string {
  const parts = [v.maker, v.model, v.year].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "車両";
}

export default async function InspectionsPage() {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerWithRole(supabase);
  if (!caller) redirect("/login?next=/admin/inspections");

  const { admin } = createTenantScopedAdmin(caller.tenantId);

  // 「今日から 180 日以内に車検満了する車両」を取得。
  // 既存の partial index (idx_vehicles_inspection_expiry) を使う。
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const horizon = new Date(today);
  horizon.setUTCDate(horizon.getUTCDate() + 180);
  const horizonStr = horizon.toISOString().slice(0, 10);

  const { data: rawVehicles } = await admin
    .from("vehicles")
    .select(
      "id, maker, model, year, plate_display, customers(name, email), inspection_expiry_date, inspection_reminder_sent_at",
    )
    .eq("tenant_id", caller.tenantId)
    .not("inspection_expiry_date", "is", null)
    .gte("inspection_expiry_date", todayStr)
    .lte("inspection_expiry_date", horizonStr)
    .order("inspection_expiry_date", { ascending: true });

  const vehicles = ((rawVehicles ?? []) as unknown as VehicleRow[]).map((v) => ({
    ...v,
    days_until: daysUntil(v.inspection_expiry_date, today),
  }));

  // テナント設定の inspection_pre_days をついでに表示用に取得
  const { data: settingRaw } = await admin
    .from("follow_up_settings")
    .select("inspection_pre_days, enabled")
    .eq("tenant_id", caller.tenantId)
    .maybeSingle();
  const setting = (settingRaw ?? null) as { inspection_pre_days: number | null; enabled: boolean } | null;

  // 期日近い順に並べた上で、緊急度別にバケットに分ける。
  const buckets: Bucket[] = [
    { key: "30", label: "30日以内", tone: "bg-rose-100 text-rose-800 border-rose-200", vehicles: [] },
    { key: "60", label: "31〜60日", tone: "bg-amber-100 text-amber-800 border-amber-200", vehicles: [] },
    { key: "90", label: "61〜90日", tone: "bg-zinc-100 text-zinc-700 border-zinc-200", vehicles: [] },
    { key: "180", label: "91〜180日", tone: "bg-zinc-50 text-zinc-600 border-zinc-200", vehicles: [] },
  ];
  for (const v of vehicles) {
    if (v.days_until <= 30) buckets[0].vehicles.push(v);
    else if (v.days_until <= 60) buckets[1].vehicles.push(v);
    else if (v.days_until <= 90) buckets[2].vehicles.push(v);
    else buckets[3].vehicles.push(v);
  }

  const totalCount = vehicles.length;
  const sentCount = vehicles.filter((v) => v.inspection_reminder_sent_at !== null).length;
  const reminderEnabled = !!setting?.enabled && (setting?.inspection_pre_days ?? 0) > 0;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-zinc-900">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">車検管理</p>
        <h1 className="text-2xl font-bold">直近の車検期日</h1>
        <p className="text-sm text-zinc-600">車検証 OCR で抽出した車両の車検満了日を一覧表示します。</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">対象車両</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{totalCount}</div>
          <div className="mt-1 text-xs text-zinc-500">今後180日以内に車検</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">送信済み</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{sentCount}</div>
          <div className="mt-1 text-xs text-zinc-500">リマインダー通知済み</div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">リマインダー設定</div>
          <div className="mt-1 text-sm font-semibold">
            {reminderEnabled ? (
              <span className="text-emerald-700">{setting?.inspection_pre_days}日前に送信</span>
            ) : (
              <span className="text-zinc-500">無効</span>
            )}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            <Link href="/admin/booking-settings" className="hover:underline">
              設定を変更
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">未送信</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{totalCount - sentCount}</div>
          <div className="mt-1 text-xs text-zinc-500">送信予定の車両</div>
        </div>
      </section>

      {vehicles.length === 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm text-zinc-600">今後180日以内に車検満了する車両はありません。</p>
          <p className="mt-2 text-xs text-zinc-500">
            車両編集画面で車検満了日を登録すると、ここに表示されリマインダーの対象になります。
          </p>
        </section>
      ) : (
        buckets.map((bucket) =>
          bucket.vehicles.length === 0 ? null : (
            <section key={bucket.key} className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${bucket.tone}`}>
                  {bucket.label}
                </span>
                <span className="text-xs text-zinc-500">{bucket.vehicles.length} 台</span>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 text-left">車両</th>
                      <th className="px-4 py-3 text-left">ナンバー</th>
                      <th className="px-4 py-3 text-left">お客様</th>
                      <th className="px-4 py-3 text-right">満了日</th>
                      <th className="px-4 py-3 text-right">残日数</th>
                      <th className="px-4 py-3 text-right">リマインダー</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.vehicles.map((v) => (
                      <tr key={v.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium">{vehicleLabel(v)}</td>
                        <td className="px-4 py-3 tabular-nums">{v.plate_display ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div>{v.customers?.name ?? "—"}</div>
                          {v.customers?.email ? (
                            <div className="text-xs text-zinc-500 break-all">{v.customers.email}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatDate(v.inspection_expiry_date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {v.days_until <= 7 ? (
                            <span className="font-semibold text-rose-700">{v.days_until} 日</span>
                          ) : (
                            <span>{v.days_until} 日</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {v.inspection_reminder_sent_at ? (
                            <span className="text-emerald-700">送信済</span>
                          ) : v.customers?.email ? (
                            <span className="text-zinc-500">未送信</span>
                          ) : (
                            <span className="text-rose-600">メール未登録</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/vehicles/${v.id}`}
                            className="text-xs text-zinc-700 hover:text-zinc-900 hover:underline"
                          >
                            詳細
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            </section>
          ),
        )
      )}

      <footer className="space-y-1 text-xs text-zinc-500">
        <p>※ リマインダーは日次の follow-up cron (毎朝 10:00 JST) で送信されます。</p>
        <p>※ 「{setting?.inspection_pre_days ?? 60}日後」が車検満了日に一致する車両のみが対象です (重複送信防止)。</p>
      </footer>
    </main>
  );
}
