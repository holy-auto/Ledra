import { requireSuperAdminSession } from "../_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "テナント一覧 | CARTRUST 管理",
};

const planLabel: Record<string, string> = {
  mini: "Mini",
  standard: "Standard",
  pro: "Pro",
};

const planColor: Record<string, string> = {
  mini: "bg-neutral-100 text-neutral-600",
  standard: "bg-sky-50 text-sky-700",
  pro: "bg-violet-50 text-violet-700",
};

function fmt(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("ja-JP");
}

export default async function TenantsPage() {
  await requireSuperAdminSession();

  const admin = createAdminClient();

  const { data: tenants } = await admin
    .from("tenants")
    .select("id, name, is_active, plan_tier, created_at")
    .order("created_at", { ascending: false });

  if (!tenants) return <p className="text-sm text-neutral-500">データを取得できませんでした。</p>;

  // Cert count per tenant
  const { data: certCounts } = await admin
    .from("certificates")
    .select("tenant_id")
    .in("tenant_id", tenants.map((t) => t.id));

  const { data: vehicleCounts } = await admin
    .from("vehicles")
    .select("tenant_id")
    .in("tenant_id", tenants.map((t) => t.id));

  const certMap: Record<string, number> = {};
  const vehicleMap: Record<string, number> = {};

  (certCounts ?? []).forEach(({ tenant_id }) => {
    certMap[tenant_id] = (certMap[tenant_id] ?? 0) + 1;
  });
  (vehicleCounts ?? []).forEach(({ tenant_id }) => {
    vehicleMap[tenant_id] = (vehicleMap[tenant_id] ?? 0) + 1;
  });

  const active = tenants.filter((t) => t.is_active);
  const inactive = tenants.filter((t) => !t.is_active);
  const sorted = [...inactive, ...active]; // 非アクティブを先頭に

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">テナント一覧</h1>
          <p className="text-sm text-neutral-500 mt-1">
            全 {tenants.length} テナント（アクティブ {active.length} / 非アクティブ {inactive.length}）
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="px-5 py-3 text-left font-semibold text-neutral-700">テナント名</th>
              <th className="px-5 py-3 text-left font-semibold text-neutral-700">プラン</th>
              <th className="px-5 py-3 text-left font-semibold text-neutral-700">状態</th>
              <th className="px-5 py-3 text-right font-semibold text-neutral-700">証明書</th>
              <th className="px-5 py-3 text-right font-semibold text-neutral-700">車両</th>
              <th className="px-5 py-3 text-left font-semibold text-neutral-700">登録日</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-b border-neutral-100 last:border-none hover:bg-neutral-50 transition-colors">
                <td className="px-5 py-3">
                  <div className="font-medium text-neutral-900">{t.name ?? "—"}</div>
                  <div className="text-[11px] text-neutral-400 font-mono">{t.id.slice(0, 8)}…</div>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      planColor[t.plan_tier ?? ""] ?? "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {planLabel[t.plan_tier ?? ""] ?? t.plan_tier ?? "—"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  {t.is_active ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      アクティブ
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 ring-1 ring-red-200">
                      非アクティブ
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-neutral-700">{certMap[t.id] ?? 0}</td>
                <td className="px-5 py-3 text-right text-neutral-700">{vehicleMap[t.id] ?? 0}</td>
                <td className="px-5 py-3 text-neutral-500">{fmt(t.created_at)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-sm text-neutral-400">
                  テナントが見つかりません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
