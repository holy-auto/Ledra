import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDealersPage() {
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

  const { data: dealers } = await admin
    .from("dealers")
    .select("*")
    .order("created_at", { ascending: false });

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    pending:   { label: "保留中",   className: "bg-amber-100 text-amber-700"  },
    approved:  { label: "承認済み", className: "bg-green-100 text-green-700" },
    suspended: { label: "停止中",   className: "bg-red-100 text-red-600"     },
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">業者管理</h1>
          <p className="text-sm text-gray-500 mt-1">{dealers?.length ?? 0}社</p>
        </div>
        <Link
          href="/admin/market/dealers/invite"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 業者を招待
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">会社名</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden md:table-cell">担当者</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden lg:table-cell">都道府県</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">ステータス</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500 hidden sm:table-cell">登録日</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(dealers ?? []).map((dealer) => {
              const s = STATUS_MAP[dealer.status] ?? { label: dealer.status, className: "bg-gray-100 text-gray-500" };
              return (
                <tr key={dealer.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{dealer.company_name}</p>
                    {dealer.phone && <p className="text-xs text-gray-400">{dealer.phone}</p>}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                    {dealer.contact_name ?? "-"}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                    {dealer.prefecture ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.className}`}>
                      {s.label}
                    </span>
                    {dealer.invite_code && (
                      <p className="text-xs font-mono text-amber-600 mt-0.5">
                        招待コード: {dealer.invite_code}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-gray-400 text-xs">
                    {new Date(dealer.created_at).toLocaleDateString("ja-JP")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/market/dealers/${dealer.id}`}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                    >
                      詳細
                    </Link>
                  </td>
                </tr>
              );
            })}
            {(dealers ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  業者が登録されていません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
