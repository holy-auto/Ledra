import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import SettingsForm from "./SettingsForm";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Attempt to fetch extended tenant columns added via migration.
 *  Returns null values gracefully if columns don't exist yet. */
async function fetchTenantExtended(tenantId: string) {
  // Try with extra columns first
  const admin = createSupabaseAdminClient();
  try {
    const { data, error } = await admin
      .from("tenants")
      .select("contact_email,contact_phone,address,website_url,registration_number,bank_info")
      .eq("id", tenantId)
      .single();
    if (error) return { contact_email: null, contact_phone: null, address: null, website_url: null, registration_number: null, bank_info: null };
    return {
      contact_email: (data as any)?.contact_email ?? null,
      contact_phone: (data as any)?.contact_phone ?? null,
      address: (data as any)?.address ?? null,
      website_url: (data as any)?.website_url ?? null,
      registration_number: (data as any)?.registration_number ?? null,
      bank_info: (data as any)?.bank_info ?? null,
    };
  } catch {
    return { contact_email: null, contact_phone: null, address: null, website_url: null, registration_number: null, bank_info: null };
  }
}

export default async function AdminSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/settings");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership?.tenant_id) {
    return <main className="p-6 text-sm text-neutral-600">tenant が見つかりません。</main>;
  }
  const tenantId = membership.tenant_id as string;

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id,name,plan_tier,logo_asset_path,created_at")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    return <main className="p-6 text-sm text-red-700">テナント情報の取得に失敗しました。</main>;
  }

  const name = (tenant.name as string | null) ?? "";
  const planTier = (tenant.plan_tier as string | null) ?? "—";
  const hasLogo = !!(tenant.logo_asset_path as string | null);
  const createdAt = (tenant.created_at as string | null);

  // Extended fields — gracefully null if migration not yet applied
  const ext = await fetchTenantExtended(tenantId);
  const hasExtendedCols = ext.contact_email !== null || ext.contact_phone !== null
    || ext.address !== null || ext.website_url !== null
    || Object.keys(ext).length > 0; // always true, indicates columns exist

  // Actually detect if columns exist by checking error on a small query
  const admin = createSupabaseAdminClient();
  const { error: detectErr } = await admin
    .from("tenants")
    .select("contact_email")
    .eq("id", tenantId)
    .limit(1)
    .single();
  const columnsExist = !detectErr || !detectErr.message.includes("does not exist");

  return (
    <main className="min-h-screen bg-neutral-50 p-6">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-neutral-300 bg-white px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-neutral-600">
              SETTINGS
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-900">テナント設定</h1>
              <p className="mt-2 text-sm text-neutral-600">
                店舗情報の編集・プラン確認を行います。
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
          >
            ダッシュボード
          </Link>
        </header>

        {/* Plan info */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">PLAN</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">プラン情報</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div className="rounded-xl bg-neutral-50 p-4">
              <div className="text-xs text-neutral-500">現在のプラン</div>
              <div className="mt-1 font-semibold text-neutral-900 uppercase">{planTier}</div>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4">
              <div className="text-xs text-neutral-500">ロゴ設定</div>
              <div className={`mt-1 font-semibold ${hasLogo ? "text-emerald-700" : "text-amber-600"}`}>
                {hasLogo ? "設定済み" : "未設定"}
              </div>
            </div>
            <div className="rounded-xl bg-neutral-50 p-4">
              <div className="text-xs text-neutral-500">テナントID</div>
              <div className="mt-1 font-mono text-[11px] text-neutral-500 break-all">{tenantId.slice(0, 16)}…</div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Link
              href="/admin/billing"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              プラン・請求管理
            </Link>
            <Link
              href="/admin/logo"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ロゴを設定
            </Link>
          </div>
        </section>

        {/* Migration notice if columns missing */}
        {!columnsExist && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
            <div className="mb-3">
              <div className="text-xs font-semibold tracking-[0.18em] text-amber-600">DB MIGRATION REQUIRED</div>
              <div className="mt-1 text-base font-semibold text-amber-900">住所・連絡先項目を有効にするには</div>
            </div>
            <p className="text-sm text-amber-800 mb-3">
              Supabase SQL Editor で以下を実行してください：
            </p>
            <pre className="rounded-xl bg-amber-900 px-4 py-3 text-xs text-amber-100 overflow-x-auto whitespace-pre-wrap">{`ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS address       text,
  ADD COLUMN IF NOT EXISTS website_url   text;`}</pre>
            <p className="mt-2 text-xs text-amber-700">
              SQL Editor: <a href="https://supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new" target="_blank" rel="noreferrer" className="underline">supabase.com/dashboard/project/cahybswpduchptvyvdkk/sql/new</a>
            </p>
          </section>
        )}

        {/* Tenant info form */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">SHOP INFO</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">店舗情報</div>
          </div>

          <SettingsForm
            name={name}
            contactEmail={columnsExist ? ext.contact_email : null}
            contactPhone={columnsExist ? ext.contact_phone : null}
            address={columnsExist ? ext.address : null}
            websiteUrl={columnsExist ? ext.website_url : null}
            registrationNumber={columnsExist ? ext.registration_number : null}
            bankInfo={columnsExist ? ext.bank_info : null}
            columnsExist={columnsExist}
          />
        </section>

        {/* Account info */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-neutral-500">ACCOUNT</div>
            <div className="mt-1 text-base font-semibold text-neutral-900">アカウント情報</div>
          </div>
          <div className="space-y-2 text-sm text-neutral-600">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">ログイン中:</span>
              <span className="font-medium text-neutral-900">{user.email ?? user.id}</span>
            </div>
            {createdAt && (
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">テナント作成日:</span>
                <span>{formatDate(createdAt)}</span>
              </div>
            )}
          </div>
          <div className="mt-4">
            <Link
              href="/api/auth/signout"
              className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              ログアウト
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
