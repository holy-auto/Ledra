import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import AdminFeatureGuard from "@/app/admin/AdminFeatureGuard";
import { FEATURES } from "@/lib/billing/featureKeys";

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
// content-type ヘッダや拡張子はクライアントが自由に偽装できるので、
// 実バイト列で本物の PNG であることを確認してから Storage に書き込む。
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  }
  return true;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ ok?: string; e?: string }> }) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect("/login?next=/admin/logo");

  const { data: mem } = await supabase.from("tenant_memberships").select("tenant_id").limit(1).single();

  if (!mem) return <div className="text-sm text-muted">tenant_memberships が見つかりません。</div>;

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
    if (!isPngSignature(bytes)) redirect("/admin/logo?e=png");

    const up = await supabase.storage
      .from("assets")
      .upload(objectPath, bytes, { contentType: "image/png", upsert: true });

    if (up.error) redirect("/admin/logo?e=2");

    const { error } = await supabase.from("tenants").update({ logo_asset_path: objectPath }).eq("id", tenantId);

    if (error) redirect("/admin/logo?e=3");

    redirect("/admin/logo?ok=1");
  }

  async function uploadSeal(formData: FormData) {
    "use server";
    const supabase = await createSupabaseServerClient();

    const file = formData.get("seal_file") as File | null;
    if (!file || file.size === 0) redirect("/admin/logo?e=seal_empty");

    if (file.type !== "image/png") redirect("/admin/logo?e=seal_png");
    if (file.size > 2 * 1024 * 1024) redirect("/admin/logo?e=seal_size");

    const objectPath = `tenants/${tenantId}/logos/seal.png`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPngSignature(bytes)) redirect("/admin/logo?e=seal_png");

    const up = await supabase.storage
      .from("assets")
      .upload(objectPath, bytes, { contentType: "image/png", upsert: true });

    if (up.error) redirect("/admin/logo?e=seal_upload");

    const { error } = await supabase.from("tenants").update({ seal_asset_path: objectPath }).eq("id", tenantId);

    if (error) redirect("/admin/logo?e=seal_save");

    redirect("/admin/logo?ok=seal");
  }

  return (
    <AdminFeatureGuard feature={FEATURES.upload_logo}>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-primary">ロゴ・角印 設定</h1>

        {sp.ok === "1" && <div className="glass-card p-3 text-sm text-success">ロゴを保存しました</div>}
        {sp.ok === "seal" && <div className="glass-card p-3 text-sm text-success">角印を保存しました</div>}
        {sp.e === "png" && <div className="glass-card p-3 text-sm text-red-500">PNGのみ対応です</div>}
        {sp.e === "seal_png" && <div className="glass-card p-3 text-sm text-red-500">角印はPNGのみ対応です</div>}
        {sp.e && !["png", "seal_png"].includes(sp.e) && (
          <div className="glass-card p-3 text-sm text-red-500">エラー: {sp.e}</div>
        )}

        {/* ロゴアップロード */}
        <section className="glass-card p-5 space-y-3">
          <h2 className="text-base font-semibold text-primary">会社ロゴ</h2>
          <p className="text-xs text-muted">証明書・帳票・請求書のヘッダーに表示されます。背景透過のPNG推奨。</p>
          <form action={uploadLogo} className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              name="file"
              accept="image/png"
              className="text-sm text-primary file:btn-secondary file:mr-3"
              required
            />
            <button className="btn-primary">アップロード</button>
          </form>
          <div className="text-[11px] text-muted">※ PNG形式のみ / 2MB以下</div>
        </section>

        {/* 角印アップロード */}
        <section className="glass-card p-5 space-y-3">
          <h2 className="text-base font-semibold text-primary">角印・社印</h2>
          <p className="text-xs text-muted">請求書・帳票に押印として表示されます。赤い角印の背景透過PNG推奨。</p>
          <form action={uploadSeal} className="flex items-center gap-3 flex-wrap">
            <input
              type="file"
              name="seal_file"
              accept="image/png"
              className="text-sm text-primary file:btn-secondary file:mr-3"
              required
            />
            <button className="btn-primary">アップロード</button>
          </form>
          <div className="text-[11px] text-muted">※ PNG形式のみ / 2MB以下 / 背景透過推奨</div>
        </section>
      </div>
    </AdminFeatureGuard>
  );
}
