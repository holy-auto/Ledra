import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantScopedAdmin } from "@/lib/supabase/admin";
import { resolveCallerFull } from "@/lib/api/auth";
import { hasMinRole } from "@/lib/auth/roles";
import { hasPermission } from "@/lib/auth/permissions";
import { canUseFeature } from "@/lib/billing/planFeatures";
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

// 認証・認可をサーバー側で再検証してから書き込み対象テナントを解決する。
//
// 実際の Storage / tenants への書き込みは admin(service-role) で行う:
// `assets` バケットの RLS はユーザーロールからの直接書き込みを許可しておらず
// (他のアップロード経路もすべて admin クライアントを使用している)、
// ユーザークライアントで upload すると RLS で弾かれてロゴが更新できないため。
//
// service-role は RLS を丸ごとバイパスするため、これまで `tenants` の
// owner-only RLS が担保していた権限チェックが失われる。UI ガードは
// クライアント側のみなので、admin クライアントを作る前に必ず
// サーバー側で権限とプランを検証する。テナントは resolveCallerFull 経由で
// active_tenant_id クッキーを尊重して解決し、複数テナント所属ユーザーが
// 別テナントへ書き込むのを防ぐ。
//
// - `logo:manage` 権限: ロール権限マトリクスに従う。
// - `upload_logo` プラン機能: AdminFeatureGuard は client-side のみなので、
//   Server Action へ直接 POST された場合の課金バイパスをサーバー側で塞ぐ。
async function resolveAuthorizedTenantId(): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const caller = await resolveCallerFull(supabase);
  if (!caller) redirect("/login?next=/admin/settings");
  // テナント設定は owner のみ（代表判断 2026-09-04）。ロゴ・社印は帳票と証明書に載る
  // 対外的な表示物で、社名・銀行口座と同じ扱いにする。
  // logo:manage は admin も持つので、権限だけでは admin が通ってしまう。
  // この経路は service-role で書くので RLS は効かず、ここが唯一の境界になる。
  if (!hasMinRole(caller.role, "owner")) redirect("/admin/settings?e=forbidden");
  if (!hasPermission(caller.role, "logo:manage")) redirect("/admin/settings?e=forbidden");
  if (!canUseFeature(caller.planTier, FEATURES.upload_logo)) redirect("/admin/settings?e=forbidden");
  return caller.tenantId;
}

async function uploadLogo(formData: FormData) {
  "use server";
  const tid = await resolveAuthorizedTenantId();
  const { admin } = createTenantScopedAdmin(tid);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) redirect("/admin/settings?e=1");

  if (file.type !== "image/png") redirect("/admin/settings?e=png");
  if (file.size > 2 * 1024 * 1024) redirect("/admin/settings?e=size"); // 2MB上限

  const objectPath = `tenants/${tid}/logos/logo.png`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPngSignature(bytes)) redirect("/admin/settings?e=png");

  const up = await admin.storage.from("assets").upload(objectPath, bytes, { contentType: "image/png", upsert: true });

  if (up.error) redirect("/admin/settings?e=2");

  const { error } = await admin.from("tenants").update({ logo_asset_path: objectPath }).eq("id", tid);

  if (error) redirect("/admin/settings?e=3");

  redirect("/admin/settings?ok=logo");
}

async function uploadSeal(formData: FormData) {
  "use server";
  const tid = await resolveAuthorizedTenantId();
  const { admin } = createTenantScopedAdmin(tid);

  const file = formData.get("seal_file") as File | null;
  if (!file || file.size === 0) redirect("/admin/settings?e=seal_empty");

  if (file.type !== "image/png") redirect("/admin/settings?e=seal_png");
  if (file.size > 2 * 1024 * 1024) redirect("/admin/settings?e=seal_size");

  const objectPath = `tenants/${tid}/logos/seal.png`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPngSignature(bytes)) redirect("/admin/settings?e=seal_png");

  const up = await admin.storage.from("assets").upload(objectPath, bytes, { contentType: "image/png", upsert: true });

  if (up.error) redirect("/admin/settings?e=seal_upload");

  const { error } = await admin.from("tenants").update({ company_seal_path: objectPath }).eq("id", tid);

  if (error) redirect("/admin/settings?e=seal_save");

  redirect("/admin/settings?ok=seal");
}

export default function LogoSealSection({ sp }: { sp: { ok?: string; e?: string } }) {
  return (
    <AdminFeatureGuard feature={FEATURES.upload_logo}>
      <section className="glass-card p-5">
        <div className="mb-5">
          <div className="text-xs font-semibold tracking-[0.18em] text-muted">ブランディング</div>
          <div className="mt-1 text-base font-semibold text-primary">ロゴ・角印</div>
          <p className="mt-1 text-xs text-muted">証明書・請求書・帳票に表示されるロゴと角印を設定します。</p>
        </div>

        {sp.ok === "logo" && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
            ロゴを保存しました。
          </div>
        )}
        {sp.ok === "seal" && (
          <div className="mb-4 rounded-xl border border-success/30 bg-success-dim px-4 py-3 text-sm text-success">
            角印を保存しました。
          </div>
        )}
        {sp.e === "png" && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            ロゴはPNG形式のみ対応です。
          </div>
        )}
        {sp.e === "size" && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            ロゴは2MB以下でアップロードしてください。
          </div>
        )}
        {sp.e === "seal_png" && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            角印はPNG形式のみ対応です。
          </div>
        )}
        {sp.e === "seal_size" && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            角印は2MB以下でアップロードしてください。
          </div>
        )}
        {sp.e === "forbidden" && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            ロゴ・角印を変更する権限がありません。
          </div>
        )}
        {sp.e && !["png", "size", "seal_png", "seal_size", "forbidden"].includes(sp.e) && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-400">
            アップロードに失敗しました（{sp.e}）。
          </div>
        )}

        <div className="space-y-5">
          {/* 会社ロゴ */}
          <div>
            <div className="text-sm font-medium text-secondary">会社ロゴ</div>
            <p className="mt-1 text-xs text-muted">証明書・帳票・請求書のヘッダーに表示されます。背景透過のPNG推奨。</p>
            <form action={uploadLogo} className="mt-2 flex items-center gap-3 flex-wrap">
              <input
                type="file"
                name="file"
                accept="image/png"
                className="text-sm text-primary file:btn-secondary file:mr-3"
                required
              />
              <button className="btn-primary">アップロード</button>
            </form>
            <div className="mt-1 text-[11px] text-muted">※ PNG形式のみ / 2MB以下</div>
          </div>

          {/* 角印・社印 */}
          <div className="border-t border-[var(--border-default)] pt-5">
            <div className="text-sm font-medium text-secondary">角印・社印</div>
            <p className="mt-1 text-xs text-muted">請求書・帳票に押印として表示されます。赤い角印の背景透過PNG推奨。</p>
            <form action={uploadSeal} className="mt-2 flex items-center gap-3 flex-wrap">
              <input
                type="file"
                name="seal_file"
                accept="image/png"
                className="text-sm text-primary file:btn-secondary file:mr-3"
                required
              />
              <button className="btn-primary">アップロード</button>
            </form>
            <div className="mt-1 text-[11px] text-muted">※ PNG形式のみ / 2MB以下 / 背景透過推奨</div>
          </div>
        </div>
      </section>
    </AdminFeatureGuard>
  );
}
