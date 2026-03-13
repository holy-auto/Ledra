import Link from "next/link";
import { requireSuperAdminSession } from "./_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CARTRUST スーパー管理",
};

type StatCard = {
  label: string;
  value: number | string;
  sub?: string;
  warn?: boolean;
  href?: string;
};

function StatCard({ label, value, sub, warn, href }: StatCard) {
  const inner = (
    <div
      className={`rounded-2xl border p-5 ${
        warn && Number(value) > 0
          ? "border-amber-200 bg-amber-50"
          : "border-neutral-200 bg-white"
      }`}
    >
      <div
        className={`text-3xl font-bold ${
          warn && Number(value) > 0 ? "text-amber-700" : "text-neutral-900"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm font-medium text-neutral-700">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function SuperAdminPage() {
  await requireSuperAdminSession();

  const admin = createAdminClient();

  const [
    tenantsRes,
    certsRes,
    vehiclesRes,
    dealersRes,
    listingsRes,
    dealsRes,
    inquiriesRes,
  ] = await Promise.all([
    admin.from("tenants").select("id, name, is_active, plan_tier, created_at"),
    admin.from("certificates").select("id", { count: "exact", head: true }),
    admin.from("vehicles").select("id", { count: "exact", head: true }),
    admin.from("dealers").select("id, status"),
    admin.from("inventory_listings").select("id, status"),
    admin.from("deals").select("id, status"),
    admin.from("listing_inquiries").select("id", { count: "exact", head: true }),
  ]);

  const tenants = tenantsRes.data ?? [];
  const dealers = dealersRes.data ?? [];
  const listings = listingsRes.data ?? [];
  const deals = dealsRes.data ?? [];

  const activeTenants = tenants.filter((t) => t.is_active).length;
  const inactiveTenants = tenants.filter((t) => !t.is_active).length;
  const pendingDealers = dealers.filter((d) => d.status === "pending").length;
  const activeDeals = deals.filter((d) => d.status === "negotiating" || d.status === "agreed").length;
  const completedDeals = deals.filter((d) => d.status === "completed").length;

  const platformStats: StatCard[] = [
    { label: "総テナント数", value: tenants.length, sub: `アクティブ ${activeTenants}`, href: "/superadmin/tenants" },
    { label: "非アクティブテナント", value: inactiveTenants, warn: true, href: "/superadmin/tenants" },
    { label: "総証明書数", value: certsRes.count ?? 0 },
    { label: "総車両数", value: vehiclesRes.count ?? 0 },
  ];

  const marketStats: StatCard[] = [
    { label: "承認済み業者", value: dealers.filter((d) => d.status === "approved").length, href: "/market/admin/dealers" },
    { label: "審査待ち業者", value: pendingDealers, warn: true, href: "/market/admin/dealers" },
    { label: "掲載中在庫", value: listings.filter((l) => l.status === "active").length, href: "/market/admin" },
    { label: "進行中商談", value: activeDeals, href: "/market/admin/deals" },
    { label: "成約数", value: completedDeals },
    { label: "総問い合わせ", value: inquiriesRes.count ?? 0, href: "/market/admin/inquiries" },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          プラットフォーム概要
        </h1>
        <p className="text-sm text-neutral-500">CARTRUST 全体の稼働状況を俯瞰します。</p>
      </div>

      {/* Alerts */}
      {(inactiveTenants > 0 || pendingDealers > 0) && (
        <div className="space-y-2">
          {inactiveTenants > 0 && (
            <Link
              href="/superadmin/tenants"
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <span className="font-semibold">⚠</span>
              <span>
                {inactiveTenants} 件の非アクティブテナントがあります
              </span>
              <span className="ml-auto text-amber-600">詳細 →</span>
            </Link>
          )}
          {pendingDealers > 0 && (
            <Link
              href="/market/admin/dealers"
              className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors"
            >
              <span className="font-semibold">⚠</span>
              <span>
                {pendingDealers} 件の業者が審査待ちです
              </span>
              <span className="ml-auto text-amber-600">詳細 →</span>
            </Link>
          )}
        </div>
      )}

      {/* Platform KPI */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PLATFORM</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {platformStats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* HolyMarket KPI */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-500">HOLYMARKET</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {marketStats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      {/* Tenant plan breakdown */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PLAN DISTRIBUTION</h2>
        <div className="grid grid-cols-3 gap-4">
          {(["mini", "standard", "pro"] as const).map((plan) => {
            const count = tenants.filter((t) => t.plan_tier === plan).length;
            const label = plan === "mini" ? "Mini" : plan === "standard" ? "Standard" : "Pro";
            return (
              <div key={plan} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <div className="text-2xl font-bold text-neutral-900">{count}</div>
                <div className="mt-1 text-sm font-medium text-neutral-700">{label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick links */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold tracking-[0.18em] text-neutral-500">QUICK LINKS</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "テナント一覧", href: "/superadmin/tenants", desc: "プラン・稼働状況を確認" },
            { label: "業者管理", href: "/market/admin/dealers", desc: "承認待ち業者を処理" },
            { label: "商談管理", href: "/market/admin/deals", desc: "全商談の状況確認" },
            { label: "Market レポート", href: "/market/admin/report", desc: "売買実績の集計" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-neutral-200 bg-white p-5 hover:border-neutral-400 hover:shadow-sm transition"
            >
              <div className="text-sm font-semibold text-neutral-900 group-hover:text-black">{item.label}</div>
              <div className="mt-1 text-xs text-neutral-500">{item.desc}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
