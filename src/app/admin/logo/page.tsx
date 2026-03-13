import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import AdminFeatureGuard from "@/app/admin/AdminFeatureGuard";
import { FEATURES } from "@/lib/billing/featureKeys";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; e?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/logo");

  const { data: mem } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .limit(1)
    .single();

  if (!mem) return <main className="p-6 text-primary">tenant_memberships が見つかりません。</main>;

  const tenantId = mem.tenant_id as string;

  async function uploadLogo(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) redirect("/admin/logo?e=1");

    if (file.type !== "image/png") redirect("/admin/logo?e=png");
if (file.size > 2 * 1024 * 1024) redirect("/admin/logo?e=size"); // 2MB上限

    const objectPath = `tenants/${tenantId}/logos/logo.png`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    const up = await supabase.storage
      .from("assets")
      .upload(objectPath, bytes, { contentType: "image/png", upsert: true });

    if (up.error) redirect("/admin/logo?e=2");

    const { error } = await supabase
      .from("tenants")
      .update({ logo_asset_path: objectPath })
      .eq("id", tenantId);

    if (error) redirect("/admin/logo?e=3");

    redirect("/admin/logo?ok=1");
  }

  return (
  <AdminFeatureGuard feature={FEATURES.upload_logo}>

    <main className="p-6 max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-primary">ロゴアップロード</h1>
      <p className="text-sm text-muted">tenant: <span className="font-mono">{tenantId}</span></p>

      {sp.ok ? <div className="glass-card p-3 text-sm text-emerald-400">保存しました</div> : null}
      {sp.e === "png" ? <div className="glass-card p-3 text-sm text-red-500">PNGのみ対応です</div> : null}
      {sp.e && sp.e !== "png" ? <div className="glass-card p-3 text-sm text-red-500">エラー: {sp.e}</div> : null}

      <form action={uploadLogo} className="glass-card p-4 space-y-3">
        <div className="text-xs text-muted">※ PNGのみ（logo.pngとして保存）</div>
        <input type="file" name="file" accept="image/png" className="text-sm text-primary file:btn-secondary file:mr-3" required />
        <button className="btn-primary w-full">アップロード</button>
      </form>
    </main>

  </AdminFeatureGuard>
);
}
