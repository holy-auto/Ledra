import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";

import { formatDateTime } from "@/lib/format";
import AdminFeatureGuard from "@/app/admin/AdminFeatureGuard";
import PageHeader from "@/components/ui/PageHeader";

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

  if (!mem) return <div className="text-sm text-muted">tenant_memberships が見つかりません。</div>;
  const tenantId = mem.tenant_id as string;

  async function createTemplate(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const name = String(formData.get("name") || "").trim() || "新規テンプレ";
    const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
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

    const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/templates?e=tenant");

    const { data: tpl, error: e1 } = await supabase
      .from("templates")
      .select("name,schema_json,layout_version")
      .eq("id", tid)
      .eq("tenant_id", tenantId)
      .single();
    if (e1 || !tpl) redirect("/admin/templates?e=dup");

    const { error: e2 } = await supabase.from("templates").insert({
      scope: "tenant",
      tenant_id: tenantId,
      name: `${tpl.name}（コピー）`,
      schema_json: tpl.schema_json,
      layout_version: tpl.layout_version ?? 1,
    });
    if (e2) redirect("/admin/templates?e=dup");
    redirect("/admin/templates?ok=1");
  }

  async function deleteTemplate(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const tid = String(formData.get("tid") || "");
    if (!tid) redirect("/admin/templates?e=del");

    const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/templates?e=tenant");

    const { error } = await supabase
      .from("templates")
      .delete()
      .eq("id", tid)
      .eq("tenant_id", tenantId);
    if (error) redirect("/admin/templates?e=del");
    redirect("/admin/templates?ok=deleted");
  }

  async function renameTemplate(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();
    const tid = String(formData.get("tid") || "");
    const name = String(formData.get("name") || "").trim();
    if (!tid || !name) redirect("/admin/templates?e=rename");

    const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();
    const tenantId = mem?.tenant_id as string | undefined;
    if (!tenantId) redirect("/admin/templates?e=tenant");

    const { error } = await supabase
      .from("templates")
      .update({ name })
      .eq("id", tid)
      .eq("tenant_id", tenantId);
    if (error) redirect("/admin/templates?e=rename");
    redirect("/admin/templates?ok=renamed");
  }

  const { data: templates, error } = await supabase
    .from("templates")
    .select("id,name,layout_version,created_at")
    .eq("scope", "tenant")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (error) return <div className="text-sm text-red-500">読み込みエラー: {error.message}</div>;

  const ERR_MSGS: Record<string, string> = {
    in_use: "このテンプレートは証明書に使用されているため削除できません。",
    del: "削除に失敗しました。",
    rename: "名前変更に失敗しました。",
    create: "作成に失敗しました。",
    dup: "複製に失敗しました。",
    tenant: "テナント情報が見つかりません。",
  };

  return (
    <AdminFeatureGuard feature="manage_templates">
      <div className="space-y-4">
        <PageHeader
          tag="テンプレート"
          title="テンプレート管理"
          actions={
            <div className="flex gap-3 text-sm">
              <Link className="btn-secondary" href="/admin/certificates/new">新規発行</Link>
              <Link className="btn-ghost" href="/admin/certificates">証明書一覧</Link>
            </div>
          }
        />

        {sp.ok && (
          <div className="glass-card p-3 text-sm text-emerald-400">
            {sp.ok === "deleted" ? "テンプレートを削除しました。" : sp.ok === "renamed" ? "名前を変更しました。" : "OK"}
          </div>
        )}
        {sp.e && (
          <div className="glass-card p-3 text-sm text-red-500">
            {ERR_MSGS[sp.e] ?? `エラー: ${sp.e}`}
          </div>
        )}

        <form action={createTemplate} className="glass-card p-4 space-y-2">
          <div className="text-sm font-semibold text-primary">新規テンプレ作成</div>
          <div className="flex gap-2 items-center">
            <input name="name" placeholder="例：コーティング標準 / PPF / 整備" className="input-field w-full" />
            <button className="btn-primary whitespace-nowrap">作成</button>
          </div>
          <div className="text-xs text-muted">ひな形スキーマで作成します。あとで編集してください。</div>
        </form>

        <div className="space-y-3">
          {(templates ?? []).length === 0 && (
            <div className="glass-card p-6 text-sm text-muted text-center">テンプレがありません</div>
          )}

          {(templates ?? []).map((t) => (
            <div key={t.id} className="glass-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-primary truncate">{t.name}</div>
                  <div className="text-xs text-muted mt-0.5">
                    v{t.layout_version} / {formatDateTime(t.created_at)}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  <Link
                    className="rounded-lg border border-border-default bg-base px-3 py-1.5 text-xs font-medium text-[#0071e3] hover:bg-surface-hover"
                    href={`/admin/templates/edit?tid=${encodeURIComponent(t.id)}`}
                  >
                    編集
                  </Link>
                  <form action={duplicateTemplate}>
                    <input type="hidden" name="tid" value={t.id} />
                    <button className="rounded-lg border border-border-default bg-base px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover">
                      複製
                    </button>
                  </form>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="tid" value={t.id} />
                    <button className="rounded-lg border border-red-200 bg-base px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">
                      削除
                    </button>
                  </form>
                </div>
              </div>

              {/* Inline rename */}
              <form action={renameTemplate} className="flex gap-2 items-center">
                <input type="hidden" name="tid" value={t.id} />
                <input name="name" defaultValue={t.name} className="input-field flex-1 text-xs" placeholder="テンプレ名" />
                <button className="rounded-lg border border-border-default bg-base px-3 py-1.5 text-xs font-medium text-secondary hover:bg-surface-hover whitespace-nowrap">
                  名前変更
                </button>
              </form>
            </div>
          ))}
        </div>
      </div>
    </AdminFeatureGuard>
  );
}
