import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminListingsPage() {
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

  const { data: listings } = await admin
    .from("inventory_listings")
    .select(`
      id, public_id, make, model, year, price, status, created_at,
      dealer:dealers(id, company_name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    active:   { label: "掲載中",   className: "bg-green-100 text-green-700" },
    reserved: { label: "商談中",   className: "bg-amber-100 text-amber-700" },
    sold:     { label: "売却済",   className: "bg-gray-100 text-gray-500"   },
    hidden:   { label: "非公開",   className: "bg-red-100 text-red-700"     },
  };

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">全在庫一覧</h1>
          <p className="text-sm text-gray-500 mt-1">{listings?.length ?? 0}件（最大200件表示）</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">車両</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">価格</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">業者</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">ステータス</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">掲載日</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(listings ?? []).map((listing: any) => {
              const s = STATUS_MAP[listing.status] ?? { label: listing.status, className: "bg-gray-100 text-gray-500" };
              return (
                <tr key={listing.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/market/search/${listing.public_id}`}
                      className="font-medium text-blue-600 hover:text-blue-800"
                    >
                      {listing.make} {listing.model}
                    </Link>
                    {listing.year && <p className="text-xs text-gray-400">{listing.year}年</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-700">
                    {listing.price != null ? `${(listing.price / 10000).toFixed(0)}万円` : "応相談"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {listing.dealer?.company_name ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                      {s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-400 text-xs">
                    {new Date(listing.created_at).toLocaleDateString("ja-JP")}
                  </td>
                </tr>
              );
            })}
            {(listings ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                  在庫がありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
