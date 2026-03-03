import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import CertificatesTableClient from "./CertificatesTableClient";

type SearchParams = { q?: string };

async function getMyTenantId(supabase: any) {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;

  const { data, error } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.tenant_id as string;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/certificates");

  const tenantId = await getMyTenantId(supabase);
  if (!tenantId) {
    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold">管理：証明書一覧</h1>
        <p className="text-sm text-red-600 mt-2">
          tenant_memberships が見つかりません。あなたのユーザーを tenant に紐付けてください。
        </p>
      </main>
    );
  }

  let query = supabase
    .from("certificates")
    .select("public_id,status,customer_name,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (q) query = query.or(`public_id.ilike.%${q}%,customer_name.ilike.%${q}%`);

  const { data: rows, error } = await query;
  if (error) return <main className="p-6">読み込みエラー: {error.message}</main>;

  async function signOut() {
    "use server";
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <main className="p-6 space-y-4">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">管理：証明書一覧</h1>
          <p className="text-sm text-gray-500">
            tenant: <span className="font-mono">{tenantId}</span> / 最新50件
          </p>
        </div>

        <div className="flex gap-3 items-center flex-wrap">
          <form className="flex gap-2" action="/admin/certificates" method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="検索（ID / 名前）"
              className="border rounded px-3 py-2 text-sm w-64"
            />
            <button className="border rounded px-3 py-2 text-sm">検索</button>
            <Link className="text-sm underline self-center" href="/admin/certificates">
              クリア
            </Link>
          </form>

          <Link className="text-sm underline" href="/admin/certificates/new">
            新規発行
          </Link>

          <form action={signOut}>
            <button className="border rounded px-3 py-2 text-sm">ログアウト</button>
          </form>
        </div>
      </header>

      <CertificatesTableClient rows={(rows ?? []) as any} q={q} />
    </main>
  );
}