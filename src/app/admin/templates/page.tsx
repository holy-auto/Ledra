import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

import AdminFeatureGuard from "@/app/admin/AdminFeatureGuard";
const DEFAULT_SCHEMA = {
  version: 1,
  sections: [
    {
      title: "コーティング",
      fields: [
        { key: "coating_brand", label: "ブランド", type: "select", options: ["LUMINUS","BLASK","FIREBALL","BULLET","KAISER"], required: true },
        { key: "layers", label: "層数", type: "select", options: ["1層","2層","3層"], required: true },
      ],
    },
  ],
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/templates");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (!mem) return <main className="p-6">tenant_memberships が見つかりません。</main>;
  const tenantId = mem.tenant_id as string;

  async function createTemplate(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const name = String(formData.get("name") || "").trim() || "新規テンプレ";
    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .limit(1)
      .single();

    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/templates?e=tenant");

    const { error } = await supabase.from("templates").insert({
      scope: "tenant",
      tenant_id: tenantId,
      name,
      schema_json: DEFAULT_SCHEMA,
      layout_version: 1,
    });

    if (error) redirect("/admin/templates?e=create");
    redirect("/admin/templates?ok=1");
  }

  async function duplicateTemplate(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const tid = String(formData.get("tid") || "");
    if (!tid) redirect("/admin/templates?e=dup");

    const { data: mem } = await supabase
      .from("tenant_memberships")
      .select("tenant_id")
      .limit(1)
      .single();
    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/templates?e=tenant");

    const { data: tpl, error: e1 } = await supabase
      .from("templates")
      .select("name,schema_json,layout_version")
      .eq("id", tid)
      .eq("tenant_id", tenantId)
      .single();

    if (e1 || !tpl) redirect("/admin/templates?e=dup");

    const newName = `${tpl.name}（コピー）`;
    const { error: e2 } = await supabase.from("templates").insert({
      scope: "tenant",
      tenant_id: tenantId,
      name: newName,
      schema_json: tpl.schema_json,
      layout_version: tpl.layout_version ?? 1,
    });

    if (e2) redirect("/admin/templates?e=dup");
    redirect("/admin/templates?ok=1");
  }

  const { data: templates, error } = await supabase
    .from("templates")
    .select("id,name,layout_version,created_at")
    .eq("scope", "tenant")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return <main className="p-6">読み込みエラー: {error.message}</main>;

  return (
  <AdminFeatureGuard feature="manage_templates">

    <main className="p-6 space-y-4 max-w-3xl">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">テンプレ管理</h1>
          <p className="text-sm text-gray-500">
            tenant: <span className="font-mono">{tenantId}</span>
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link className="underline" href="/admin/certificates/new">発行</Link>
          <Link className="underline" href="/admin/certificates">証明書一覧</Link>
        </div>
      </header>

      {sp.ok ? <div className="border rounded p-3 text-sm">OK ✅</div> : null}
      {sp.e ? <div className="border rounded p-3 text-sm text-red-600">エラー: {sp.e}</div> : null}

      <form action={createTemplate} className="border rounded p-4 space-y-2">
        <div className="text-sm font-semibold">新規テンプレ作成</div>
        <div className="flex gap-2 items-center">
          <input name="name" placeholder="例：コーティング標準 / PPF / 整備" className="border rounded px-3 py-2 text-sm w-full" />
          <button className="border rounded px-3 py-2 text-sm whitespace-nowrap">作成</button>
        </div>
        <div className="text-xs text-gray-500">※ ひな形スキーマで作成します。あとで編集してください。</div>
      </form>

      <div className="border rounded overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">名前</th>
              <th className="text-left p-3">layout</th>
              <th className="text-left p-3">作成</th>
              <th className="text-left p-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {(templates ?? []).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-3">{t.name}</td>
                <td className="p-3">{t.layout_version}</td>
                <td className="p-3 whitespace-nowrap">{new Date(t.created_at).toLocaleString("ja-JP")}</td>
                <td className="p-3">
                  <div className="flex gap-3 items-center flex-wrap">
                    <Link className="underline" href={`/admin/templates/edit?tid=${encodeURIComponent(t.id)}`}>
                      編集
                    </Link>
                    <form action={duplicateTemplate}>
                      <input type="hidden" name="tid" value={t.id} />
                      <button className="border rounded px-2 py-1 text-xs">複製</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}

            {(templates ?? []).length === 0 && (
              <tr><td className="p-6 text-gray-500" colSpan={4}>テンプレがありません</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  
  </AdminFeatureGuard>
);
}

