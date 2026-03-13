import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DealerStatusClient from "./_DealerStatusClient";

type Params = { params: Promise<{ id: string }> };

export default async function AdminDealerDetailPage({ params }: Params) {
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

  const { id } = await params;

  const { data: dealer } = await admin
    .from("dealers")
    .select("*")
    .eq("id", id)
    .single();

  if (!dealer) notFound();

  // この業者の在庫・商談・問い合わせ統計
  const [listingsRes, dealsRes] = await Promise.all([
    admin.from("inventory_listings").select("id, status", { count: "exact" }).eq("dealer_id", id),
    admin.from("deals").select("id, status", { count: "exact" })
      .or(`buyer_dealer_id.eq.${id},seller_dealer_id.eq.${id}`),
  ]);

  const listings = listingsRes.data ?? [];
  const deals = dealsRes.data ?? [];

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    pending:   { label: "保留中",   className: "bg-amber-100 text-amber-700"  },
    approved:  { label: "承認済み", className: "bg-green-100 text-green-700" },
    suspended: { label: "停止中",   className: "bg-red-100 text-red-600"     },
  };
  const s = STATUS_MAP[dealer.status] ?? { label: dealer.status, className: "bg-gray-100 text-gray-500" };

  return (
    <div className="p-6 max-w-3xl">
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/admin/market" className="hover:text-gray-700">マーケット管理</Link>
        <span>/</span>
        <Link href="/admin/market/dealers" className="hover:text-gray-700">業者一覧</Link>
        <span>/</span>
        <span className="text-gray-900">{dealer.company_name}</span>
      </nav>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{dealer.company_name}</h1>
            {dealer.contact_name && <p className="text-sm text-gray-500 mt-0.5">担当: {dealer.contact_name}</p>}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
            {s.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {dealer.phone && (
            <div>
              <p className="text-xs text-gray-400">電話</p>
              <p className="text-gray-700">{dealer.phone}</p>
            </div>
          )}
          {dealer.prefecture && (
            <div>
              <p className="text-xs text-gray-400">都道府県</p>
              <p className="text-gray-700">{dealer.prefecture}</p>
            </div>
          )}
          {dealer.address && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400">住所</p>
              <p className="text-gray-700">{dealer.address}</p>
            </div>
          )}
          {dealer.invite_code && (
            <div>
              <p className="text-xs text-gray-400">招待コード（未使用）</p>
              <p className="font-mono font-bold text-amber-600">{dealer.invite_code}</p>
            </div>
          )}
          {dealer.approved_at && (
            <div>
              <p className="text-xs text-gray-400">承認日</p>
              <p className="text-gray-700">{new Date(dealer.approved_at).toLocaleDateString("ja-JP")}</p>
            </div>
          )}
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{listings.filter((l) => l.status === "active").length}</p>
          <p className="text-xs text-gray-500">掲載中</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{listings.length}</p>
          <p className="text-xs text-gray-500">総在庫数</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{deals.filter((d) => d.status === "completed").length}</p>
          <p className="text-xs text-gray-500">成立商談</p>
        </div>
      </div>

      {/* ステータス変更 */}
      <DealerStatusClient dealerId={id} currentStatus={dealer.status} />
    </div>
  );
}
