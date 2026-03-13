import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

async function getAdminTenant() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/login");
  return membership.tenant_id;
}

export default async function AdminMarketPage() {
  await getAdminTenant();

  const admin = createAdminClient();

  const [dealersRes, listingsRes, inquiriesRes, dealsRes] = await Promise.all([
    admin.from("dealers").select("id, status", { count: "exact" }),
    admin.from("inventory_listings").select("id, status", { count: "exact" }),
    admin.from("listing_inquiries").select("id, status", { count: "exact" }),
    admin.from("deals").select("id, status", { count: "exact" }),
  ]);

  const dealers = dealersRes.data ?? [];
  const listings = listingsRes.data ?? [];
  const inquiries = inquiriesRes.data ?? [];
  const deals = dealsRes.data ?? [];

  const stats = [
    { label: "承認済み業者", value: dealers.filter((d) => d.status === "approved").length, href: "/admin/market/dealers" },
    { label: "保留中の業者", value: dealers.filter((d) => d.status === "pending").length, href: "/admin/market/dealers", warn: true },
    { label: "掲載中の在庫", value: listings.filter((l) => l.status === "active").length, href: "/admin/market/listings" },
    { label: "進行中の商談", value: deals.filter((d) => d.status === "negotiating" || d.status === "agreed").length, href: "/admin/market/deals" },
    { label: "未返信の問い合わせ", value: inquiries.filter((i) => i.status === "open").length, href: "/admin/market/inquiries" },
    { label: "総在庫数", value: listings.length, href: "/admin/market/listings" },
  ];

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">マーケット管理</h1>
        <p className="text-sm text-gray-500 mt-1">BtoB中古車在庫共有プラットフォームの管理</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`rounded-xl border p-4 hover:shadow-sm transition-shadow ${
              s.warn && s.value > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"
            }`}
          >
            <p className={`text-3xl font-bold ${s.warn && s.value > 0 ? "text-amber-700" : "text-gray-900"}`}>
              {s.value}
            </p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/market/dealers/invite"
          className="flex items-center gap-3 bg-blue-600 text-white rounded-xl p-4 hover:bg-blue-700 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          <span className="font-semibold">業者を招待する</span>
        </Link>
        <Link
          href="/admin/market/dealers"
          className="flex items-center gap-3 bg-white border border-gray-200 text-gray-700 rounded-xl p-4 hover:shadow-sm transition-shadow"
        >
          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <span className="font-semibold">業者一覧</span>
        </Link>
      </div>
    </div>
  );
}
